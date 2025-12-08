const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { loadMapData, saveMapData } = await requireModuleByName("fileOperations.js");
const { preloadImage } = await requireModuleByName("imageOperations.js");


function useMapData(mapId, mapName = '', mapType = 'grid') {
  const [mapData, setMapData] = dc.useState(null);
  const [isLoading, setIsLoading] = dc.useState(true);
  const [saveStatus, setSaveStatus] = dc.useState('Saved');
  const [pendingData, setPendingData] = dc.useState(null);
  const [backgroundImageReady, setBackgroundImageReady] = dc.useState(false);
  const saveTimerRef = dc.useRef(null);
  

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
  
  // Debounced save effect
  dc.useEffect(() => {
    if (!pendingData) return;
    
    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    
    // Set new timer for 2 seconds
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('Saving...');
      const success = await saveMapData(mapId, pendingData);
      setSaveStatus(success ? 'Saved' : 'Save failed');
      setPendingData(null);
      saveTimerRef.current = null;
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
      setSaveStatus('Saving...');
      const success = await saveMapData(mapId, pendingData);
      setSaveStatus(success ? 'Saved' : 'Save failed');
      setPendingData(null);
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
  
  return { mapData, isLoading, saveStatus, updateMapData, forceSave, backgroundImageReady };
}

return { useMapData };