// components/TextInputModal.jsx - Modal dialog for text label entry

const TextInputModal = ({ initialValue = '', onSubmit, onCancel, title = 'Add Text Label', placeholder = 'Enter label text...' }) => {
    const [text, setText] = dc.useState(initialValue);
    const inputRef = dc.useRef(null);
    
    // Auto-focus input when modal opens
    dc.useEffect(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        // Select all text if editing existing label
        if (initialValue) {
          inputRef.current.select();
        }
      }
    }, []);
    
    // Handle keyboard shortcuts
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    
    const handleSubmit = () => {
      const trimmed = text.trim();
      if (trimmed.length > 0 && trimmed.length <= 200) {
        onSubmit(trimmed);
      }
    };
    
    // Prevent clicks inside modal from closing it
    const handleModalClick = (e) => {
      e.stopPropagation();
    };
    
    return (
      <div className="dmt-modal-overlay" onClick={onCancel}>
        <div 
          className="dmt-modal-content" 
          onClick={handleModalClick}
        >
          <h3 className="dmt-modal-title">{title}</h3>
          
          <input
            ref={inputRef}
            type="text"
            className="dmt-modal-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={200}
            placeholder={placeholder}
          />
          
          <div className="dmt-modal-buttons">
            <button 
              className="dmt-modal-btn dmt-modal-btn-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button 
              className="dmt-modal-btn dmt-modal-btn-submit"
              onClick={handleSubmit}
              disabled={text.trim().length === 0}
            >
              {initialValue ? 'Update' : 'Add Label'}
            </button>
          </div>
          
          <div className="dmt-modal-hint">
            Press Enter to confirm, Esc to cancel
          </div>
        </div>
      </div>
    );
  };
  
  return { TextInputModal };