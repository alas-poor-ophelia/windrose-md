export const DragHelpers = {
  getAfterElement(container: HTMLElement, y: number): HTMLElement | undefined {
    const draggableElements = [...container.querySelectorAll('.dmt-settings-object-row:not(.dmt-dragging)')] as HTMLElement[];

    return draggableElements.reduce<{ offset: number; element?: HTMLElement }>((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
};
