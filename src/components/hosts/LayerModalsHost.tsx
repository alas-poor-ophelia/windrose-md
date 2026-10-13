// LayerModalsHost.tsx - Preact fallback modals for the layers panel: edit a
// layer's name/icon, and clone a layer (used only when the native Obsidian
// clone modal could not open).

import type { VNode, ComponentProps } from 'preact';
import type { MapData } from '#types/index';
import { ModalPortal } from '../modals/ModalPortal';
import { LayerEditModal } from '../modals/LayerEditModal';
import { CloneLayerModal } from '../modals/CloneLayerModal';
import { getLayerById } from '../../persistence/layerAccessor';
import type { useLayerHistory } from '../../hooks/state/useLayerHistory';

type LayerHistory = ReturnType<typeof useLayerHistory>;

interface LayerModalsHostProps {
  mapData: MapData;
  editingLayer: ComponentProps<typeof LayerEditModal>['layer'] | null | undefined;
  editingLayerId: string | null;
  setEditingLayerId: (id: string | null) => void;
  onUpdateLayerDisplay: LayerHistory['handleUpdateLayerDisplay'];
  cloningLayerId: string | null;
  setCloningLayerId: (id: string | null) => void;
  onLayerClone: LayerHistory['handleLayerClone'];
}

const LayerModalsHost = ({ mapData, editingLayer, editingLayerId, setEditingLayerId, onUpdateLayerDisplay, cloningLayerId, setCloningLayerId, onLayerClone }: LayerModalsHostProps): VNode => {
  const cloningLayer = cloningLayerId != null && cloningLayerId !== '' ? getLayerById(mapData, cloningLayerId) : null;
  return (
    <>
      {editingLayer && (
        <ModalPortal>
          <LayerEditModal
            layer={editingLayer}
            defaultName={String(editingLayer.order + 1)}
            onSave={(name, icon) => {
              if (editingLayerId != null) {
                onUpdateLayerDisplay(editingLayerId, name, icon);
              }
              setEditingLayerId(null);
            }}
            onCancel={() => setEditingLayerId(null)}
          />
        </ModalPortal>
      )}

      {cloningLayer != null && cloningLayerId != null && (
        <ModalPortal>
          <CloneLayerModal
            layerName={cloningLayer.name ?? String(cloningLayer.order + 1)}
            onClone={(mode) => {
              onLayerClone(cloningLayerId, mode);
              setCloningLayerId(null);
            }}
            onCancel={() => setCloningLayerId(null)}
          />
        </ModalPortal>
      )}
    </>
  );
};

export { LayerModalsHost };
