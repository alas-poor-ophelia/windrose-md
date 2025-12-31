const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { loadMapData, saveMapData } = await requireModuleByName("fileOperations.js");
const { preloadImage } = await requireModuleByName("imageOperations.js");
const { getEffectiveSettings } = await requireModuleByName("settingsAccessor.ts");


function useMapData(mapId, mapName = '', mapType = 'grid') {
  const [mapData, setMapData] = dc.useState(null);
  const [isLoading, setIsLoading] = dc.useState(true);
  const [saveStatus, setSaveStatus] = dc.useState('Saved');
  const [pendingData, setPendingData] = dc.useState(null);
  const [backgroundImageReady, setBackgroundImageReady] = dc.useState(false);
  const [fowImageReady, setFowImageReady] = dc.useState(false);
  const saveTimerRef = dc.useRef(null);
  const saveVersionRef = dc.useRef(0); // Track version to prevent race conditions
  

  //Load map data on mount
  dc.useEffect(() => {
    async function load() {
      const data = await loadMapData(mapId, mapName, mapType);
      setMapData(data);
      setIsLoading(false);
    }
    load();
  }, [mapId, mapName, mapType]);
  
  // Preload background image when map data loads
  dc.useEffect(() => {
    if (mapData?.backgroundImage?.path) {
      setBackgroundImageReady(false);
      preloadImage(mapData.backgroundImage.path).then((img) => {
        if (img) {
          setBackgroundImageReady(true);
        }
      });
    } else {
      setBackgroundImageReady(false);
    }
  }, [mapData?.backgroundImage?.path]);
  
  // Preload fog of war image when map loads or settings change
  // Using mapData?.settings as dependency ensures this runs on initial load
  dc.useEffect(() => {
    if (!mapData) return;
    
    // Get effective settings (handles global vs per-map)
    const effectiveSettings = getEffectiveSettings(mapData.settings);
    const fowImagePath = effectiveSettings.fogOfWarImage;
    
    if (fowImagePath) {
      setFowImageReady(false);
      preloadImage(fowImagePath).then((img) => {
        if (img) {
          setFowImageReady(true);
        }
      });
    } else {
      setFowImageReady(false);
    }
  }, [mapData?.settings]);
  
  // Debounced save effect
  dc.useEffect(() => {
    if (!pendingData) return;
    
    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    
    // Increment version for this pending data
    const currentVersion = ++saveVersionRef.current;
    
    // Set new timer for 2 seconds
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('Saving...');
      const success = await saveMapData(mapId, pendingData);
      
      // Only clear pendingData if no new changes came in during the async save
      // (if version changed, another change was made and will trigger its own save)
      if (saveVersionRef.current === currentVersion) {
        setSaveStatus(success ? 'Saved' : 'Save failed');
        setPendingData(null);
        saveTimerRef.current = null;
      } else {
        // New changes came in during save - they'll be saved by their own timer
        // Just update status to indicate we're not fully saved yet
        if (success) {
          setSaveStatus('Unsaved changes');
        }
      }
    }, 2000);
    
    // Cleanup function
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [pendingData, mapId]);
  
  // Update map data and trigger debounced save
  // Supports both direct updates and functional updates:
  //   updateMapData(newData)
  //   updateMapData(currentData => ({ ...currentData, ...changes }))
  const updateMapData = dc.useCallback((updaterOrData) => {
    setMapData(prev => {
      const newData = typeof updaterOrData === 'function' 
        ? updaterOrData(prev) 
        : updaterOrData;
      setPendingData(newData);
      setSaveStatus('Unsaved changes');
      return newData;
    });
  }, []);
  
  // Force immediate save (for when component unmounts or critical saves)
  const forceSave = dc.useCallback(async () => {
    if (pendingData) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      
      // Capture current version before async operation
      const versionAtSaveStart = saveVersionRef.current;
      
      setSaveStatus('Saving...');
      const success = await saveMapData(mapId, pendingData);
      
      // Only clear if no new changes came in during the save
      if (saveVersionRef.current === versionAtSaveStart) {
        setSaveStatus(success ? 'Saved' : 'Save failed');
        setPendingData(null);
      } else {
        // New changes came in - don't clear pendingData
        if (success) {
          setSaveStatus('Unsaved changes');
        }
      }
    }
  }, [pendingData, mapId]);
  
  // Save on unmount if there's pending data
  dc.useEffect(() => {
    return () => {
      if (pendingData && saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        // Fire and forget save on unmount
        saveMapData(mapId, pendingData);
      }
    };
  }, [pendingData, mapId]);
  
  return { mapData, isLoading, saveStatus, updateMapData, forceSave, backgroundImageReady, fowImageReady };
}

return { useMapData };