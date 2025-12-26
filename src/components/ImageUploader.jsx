import { useRef } from 'react'
import './ImageUploader.css'

function ImageUploader({ onImageUpload, error }) {
  const fileInputRef = useRef(null)
  const dropZoneRef = useRef(null)

  const handleFileSelect = (file) => {
    if (!file) return

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png']
    if (!validTypes.includes(file.type)) {
      return
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return
    }

    onImageUpload(file)
  }

  const handleInputChange = (e) => {
    const file = e.target.files?.[0]
    handleFileSelect(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    const file = e.dataTransfer.files?.[0]
    handleFileSelect(file)
    
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.remove('drag-over')
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.add('drag-over')
    }
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.remove('drag-over')
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="uploader-container">
      <div
        ref={dropZoneRef}
        className="drop-zone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png"
          onChange={handleInputChange}
          className="file-input"
        />
        
        <div className="drop-zone-content">
          <svg
            className="upload-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <h3 className="drop-zone-title">Drop your image here</h3>
          <p className="drop-zone-subtitle">or click to browse</p>
          <p className="drop-zone-info">Supports JPG and PNG (max 10MB)</p>
        </div>
      </div>

      {error && (
        <div className="upload-error">
          <svg
            className="error-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p>{error}</p>
        </div>
      )}
    </div>
  )
}

export default ImageUploader

