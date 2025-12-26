import { useState, useRef, useEffect } from 'react'
import './ImageCropper.css'

// Preset ratios for passport photos (in mm, converted to aspect ratios)
const PASSPORT_PRESETS = {
  'US Passport': { width: 2, height: 2, ratio: 1 }, // 2x2 inches
  'UK Passport': { width: 45, height: 35, ratio: 45 / 35 }, // 45x35mm
  'India Passport': { width: 35, height: 45, ratio: 35 / 45 }, // 35x45mm
  'EU Passport': { width: 35, height: 45, ratio: 35 / 45 }, // 35x45mm
  'Canada Passport': { width: 50, height: 70, ratio: 50 / 70 }, // 50x70mm
  'Australia Passport': { width: 35, height: 45, ratio: 35 / 45 }, // 35x45mm
  'China Passport': { width: 33, height: 48, ratio: 33 / 48 }, // 33x48mm
  'Japan Passport': { width: 35, height: 45, ratio: 35 / 45 }, // 35x45mm
}

// Common aspect ratio presets
const COMMON_PRESETS = {
  'Square (1:1)': { ratio: 1 },
  'Landscape (4:3)': { ratio: 4 / 3 },
  'Landscape (16:9)': { ratio: 16 / 9 },
  'Portrait (3:4)': { ratio: 3 / 4 },
  'Portrait (9:16)': { ratio: 9 / 16 },
  'Classic (3:2)': { ratio: 3 / 2 },
  'Widescreen (21:9)': { ratio: 21 / 9 },
  'Free Form': { ratio: null }, // No fixed ratio
}

function ImageCropper({ image, onCrop, onCancel }) {
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const [selectedPreset, setSelectedPreset] = useState('Free Form')
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [resizeCorner, setResizeCorner] = useState(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const imageRef = useRef(null)
  const cropRef = useRef(crop)

  useEffect(() => {
    if (image && containerRef.current) {
      const img = new Image()
      img.onload = () => {
        // Wait a bit for container to be fully rendered
        const updateSize = () => {
          const container = containerRef.current
          if (!container) return
          
          // Get actual available space (accounting for padding)
          const containerRect = container.getBoundingClientRect()
          const availableWidth = containerRect.width - 40 // padding
          const availableHeight = Math.min(containerRect.height - 40, 500)
          
          let displayWidth = img.width
          let displayHeight = img.height
          
          // Scale to fit container while maintaining aspect ratio
          const widthRatio = availableWidth / displayWidth
          const heightRatio = availableHeight / displayHeight
          const scale = Math.min(widthRatio, heightRatio, 1) // Don't upscale
          
          displayWidth = Math.round(displayWidth * scale)
          displayHeight = Math.round(displayHeight * scale)
          
          setImageSize({ width: img.width, height: img.height })
          setContainerSize({ width: displayWidth, height: displayHeight })
          
          // Initialize crop to full image
          setCrop({
            x: 0,
            y: 0,
            width: displayWidth,
            height: displayHeight
          })
        }
        
        // Try immediately and also after a short delay
        updateSize()
        setTimeout(updateSize, 100)
      }
      img.src = image
      imageRef.current = img
    }
  }, [image])

  // Update crop ref when crop changes
  useEffect(() => {
    cropRef.current = crop
  }, [crop])

  useEffect(() => {
    if (containerSize.width > 0 && containerSize.height > 0) {
      applyPreset(selectedPreset)
    }
  }, [selectedPreset, containerSize])

  // Helper function to get coordinates from event (works for both mouse and touch)
  const getEventCoordinates = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { clientX, clientY }
  }

  // Helper function to update crop position
  const updateCropPosition = (clientX, clientY) => {
    if (!containerRef.current) return
    
    // Find the image wrapper element
    const imageWrapper = containerRef.current.querySelector('.cropper-image-wrapper')
    if (!imageWrapper) return
    
    const wrapperRect = imageWrapper.getBoundingClientRect()
    
    // Calculate position relative to the image wrapper
    const x = clientX - wrapperRect.left
    const y = clientY - wrapperRect.top
    
    // Clamp coordinates to image bounds
    const clampedX = Math.max(0, Math.min(x, containerSize.width))
    const clampedY = Math.max(0, Math.min(y, containerSize.height))
    
    if (isDragging && !isResizing) {
      // Moving the crop area
      const currentCrop = cropRef.current
      const newX = clampedX - dragStart.x
      const newY = clampedY - dragStart.y
      
      // Constrain to container bounds - allow full range of movement
      const maxX = Math.max(0, containerSize.width - currentCrop.width)
      const maxY = Math.max(0, containerSize.height - currentCrop.height)
      
      const constrainedX = Math.max(0, Math.min(newX, maxX))
      const constrainedY = Math.max(0, Math.min(newY, maxY))
      
      setCrop(prev => ({
        ...prev,
        x: constrainedX,
        y: constrainedY
      }))
    } else if (isResizing) {
      // Resizing from a corner
      const currentCrop = cropRef.current
      let newCrop = { ...currentCrop }
      
      switch (resizeCorner) {
        case 'tl':
          newCrop.width = currentCrop.x + currentCrop.width - clampedX
          newCrop.height = currentCrop.y + currentCrop.height - clampedY
          newCrop.x = clampedX
          newCrop.y = clampedY
          break
        case 'tr':
          newCrop.width = clampedX - currentCrop.x
          newCrop.height = currentCrop.y + currentCrop.height - clampedY
          newCrop.y = clampedY
          break
        case 'bl':
          newCrop.width = currentCrop.x + currentCrop.width - clampedX
          newCrop.height = clampedY - currentCrop.y
          newCrop.x = clampedX
          break
        case 'br':
          newCrop.width = clampedX - currentCrop.x
          newCrop.height = clampedY - currentCrop.y
          break
      }
      
      // Maintain aspect ratio if not free form
      if (selectedPreset !== 'Free Form') {
        const ratio = PASSPORT_PRESETS[selectedPreset]?.ratio || COMMON_PRESETS[selectedPreset]?.ratio
        if (ratio) {
          const newRatio = newCrop.width / newCrop.height
          if (Math.abs(newRatio - ratio) > 0.01) {
            if (resizeCorner === 'br' || resizeCorner === 'tl') {
              newCrop.height = newCrop.width / ratio
              if (resizeCorner === 'tl') {
                newCrop.y = currentCrop.y + currentCrop.height - newCrop.height
              }
            } else {
              newCrop.width = newCrop.height * ratio
              if (resizeCorner === 'bl') {
                newCrop.x = currentCrop.x + currentCrop.width - newCrop.width
              }
            }
          }
        }
      }
      
      // Constrain to container
      if (newCrop.x < 0) {
        newCrop.width += newCrop.x
        newCrop.x = 0
      }
      if (newCrop.y < 0) {
        newCrop.height += newCrop.y
        newCrop.y = 0
      }
      if (newCrop.x + newCrop.width > containerSize.width) {
        const overflow = (newCrop.x + newCrop.width) - containerSize.width
        if (resizeCorner === 'tr' || resizeCorner === 'br') {
          newCrop.width = containerSize.width - newCrop.x
        } else {
          newCrop.width -= overflow
          newCrop.x = containerSize.width - newCrop.width
        }
      }
      if (newCrop.y + newCrop.height > containerSize.height) {
        const overflow = (newCrop.y + newCrop.height) - containerSize.height
        if (resizeCorner === 'bl' || resizeCorner === 'br') {
          newCrop.height = containerSize.height - newCrop.y
        } else {
          newCrop.height -= overflow
          newCrop.y = containerSize.height - newCrop.height
        }
      }
      
      // Minimum size
      if (newCrop.width < 20) {
        const diff = 20 - newCrop.width
        newCrop.width = 20
        if (resizeCorner === 'tl' || resizeCorner === 'bl') {
          newCrop.x -= diff
        }
      }
      if (newCrop.height < 20) {
        const diff = 20 - newCrop.height
        newCrop.height = 20
        if (resizeCorner === 'tl' || resizeCorner === 'tr') {
          newCrop.y -= diff
        }
      }
      
      // Final bounds check
      newCrop.x = Math.max(0, Math.min(newCrop.x, containerSize.width - newCrop.width))
      newCrop.y = Math.max(0, Math.min(newCrop.y, containerSize.height - newCrop.height))
      newCrop.width = Math.max(20, Math.min(newCrop.width, containerSize.width - newCrop.x))
      newCrop.height = Math.max(20, Math.min(newCrop.height, containerSize.height - newCrop.y))
      
      setCrop(newCrop)
    }
  }

  // Global mouse and touch event handlers
  useEffect(() => {
    if (isDragging || isResizing) {
      const handleMove = (e) => {
        e.preventDefault()
        const { clientX, clientY } = getEventCoordinates(e)
        updateCropPosition(clientX, clientY)
      }
      
      const handleEnd = () => {
        setIsDragging(false)
        setIsResizing(false)
        setResizeCorner(null)
      }
      
      // Mouse events
      document.addEventListener('mousemove', handleMove, { passive: false })
      document.addEventListener('mouseup', handleEnd)
      
      // Touch events
      document.addEventListener('touchmove', handleMove, { passive: false })
      document.addEventListener('touchend', handleEnd)
      document.addEventListener('touchcancel', handleEnd)
      
      return () => {
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleEnd)
        document.removeEventListener('touchmove', handleMove)
        document.removeEventListener('touchend', handleEnd)
        document.removeEventListener('touchcancel', handleEnd)
      }
    }
  }, [isDragging, isResizing, resizeCorner, dragStart, containerSize, selectedPreset])

  const applyPreset = (presetName) => {
    let ratio = null
    
    if (presetName in PASSPORT_PRESETS) {
      ratio = PASSPORT_PRESETS[presetName].ratio
    } else if (presetName in COMMON_PRESETS) {
      ratio = COMMON_PRESETS[presetName].ratio
    }
    
    if (ratio === null) {
      // Free form - set to full image
      setCrop({
        x: 0,
        y: 0,
        width: containerSize.width,
        height: containerSize.height
      })
      return
    }
    
    // Calculate crop area with the selected ratio
    const containerRatio = containerSize.width / containerSize.height
    
    let cropWidth, cropHeight
    
    if (ratio > containerRatio) {
      // Ratio is wider than container, fit to width
      cropWidth = containerSize.width
      cropHeight = containerSize.width / ratio
    } else {
      // Ratio is taller than container, fit to height
      cropHeight = containerSize.height
      cropWidth = containerSize.height * ratio
    }
    
    // Center the crop
    const x = (containerSize.width - cropWidth) / 2
    const y = (containerSize.height - cropHeight) / 2
    
    setCrop({
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: Math.min(cropWidth, containerSize.width),
      height: Math.min(cropHeight, containerSize.height)
    })
  }

  const handleCropAreaStart = (e) => {
    // Only start dragging if clicking/touching on the crop area itself, not on handles
    if (e.target.classList.contains('crop-handle') || e.target.closest('.crop-handle')) {
      return
    }
    
    e.preventDefault()
    e.stopPropagation()
    
    if (!containerRef.current) return
    
    // Find the image wrapper element
    const imageWrapper = containerRef.current.querySelector('.cropper-image-wrapper')
    if (!imageWrapper) return
    
    const wrapperRect = imageWrapper.getBoundingClientRect()
    const { clientX, clientY } = getEventCoordinates(e)
    const x = clientX - wrapperRect.left
    const y = clientY - wrapperRect.top
    
    // Check if click/touch is inside crop area
    const currentCrop = cropRef.current
    if (x >= currentCrop.x && x <= currentCrop.x + currentCrop.width &&
        y >= currentCrop.y && y <= currentCrop.y + currentCrop.height) {
      setIsDragging(true)
      setIsResizing(false)
      setDragStart({ x: x - currentCrop.x, y: y - currentCrop.y })
    }
  }

  const handleResizeStart = (corner, e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    setIsDragging(false)
    setResizeCorner(corner)
  }

  const handleCrop = () => {
    if (!imageRef.current) return
    
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    // Calculate actual crop coordinates in original image
    const scaleX = imageRef.current.width / containerSize.width
    const scaleY = imageRef.current.height / containerSize.height
    
    const actualX = crop.x * scaleX
    const actualY = crop.y * scaleY
    const actualWidth = crop.width * scaleX
    const actualHeight = crop.height * scaleY
    
    canvas.width = actualWidth
    canvas.height = actualHeight
    
    ctx.drawImage(
      imageRef.current,
      actualX, actualY, actualWidth, actualHeight,
      0, 0, actualWidth, actualHeight
    )
    
    const croppedDataURL = canvas.toDataURL('image/png')
    onCrop(croppedDataURL)
  }

  return (
    <div className="cropper-modal">
      <div className="cropper-content">
        <div className="cropper-header">
          <h2>Crop Image</h2>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>
        
        <div className="preset-selector">
          <div className="preset-group">
            <label>Passport Sizes:</label>
            <div className="preset-buttons">
              {Object.keys(PASSPORT_PRESETS).map(preset => (
                <button
                  key={preset}
                  className={`preset-btn ${selectedPreset === preset ? 'active' : ''}`}
                  onClick={() => setSelectedPreset(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
          
          <div className="preset-group">
            <label>Common Ratios:</label>
            <div className="preset-buttons">
              {Object.keys(COMMON_PRESETS).map(preset => (
                <button
                  key={preset}
                  className={`preset-btn ${selectedPreset === preset ? 'active' : ''}`}
                  onClick={() => setSelectedPreset(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div 
          className="cropper-container"
          ref={containerRef}
        >
          <div 
            className="cropper-image-wrapper"
            style={{
              width: `${containerSize.width}px`,
              height: `${containerSize.height}px`,
              position: 'relative',
              display: 'inline-block',
              margin: '0 auto'
            }}
          >
            <img 
              src={image} 
              alt="Crop" 
              className="cropper-image"
              style={{
                width: `${containerSize.width}px`,
                height: `${containerSize.height}px`,
                display: 'block'
              }}
            />
          {/* Darken overlay - top */}
          {crop.y > 0 && (
            <div 
              className="crop-darken-top"
              style={{
                left: 0,
                top: 0,
                width: '100%',
                height: `${crop.y}px`
              }}
            />
          )}
          
          {/* Darken overlay - bottom */}
          {crop.y + crop.height < containerSize.height && (
            <div 
              className="crop-darken-bottom"
              style={{
                left: 0,
                top: `${crop.y + crop.height}px`,
                width: '100%',
                height: `${containerSize.height - (crop.y + crop.height)}px`
              }}
            />
          )}
          
          {/* Darken overlay - left */}
          {crop.x > 0 && (
            <div 
              className="crop-darken-left"
              style={{
                left: 0,
                top: `${crop.y}px`,
                width: `${crop.x}px`,
                height: `${crop.height}px`
              }}
            />
          )}
          
          {/* Darken overlay - right */}
          {crop.x + crop.width < containerSize.width && (
            <div 
              className="crop-darken-right"
              style={{
                left: `${crop.x + crop.width}px`,
                top: `${crop.y}px`,
                width: `${containerSize.width - (crop.x + crop.width)}px`,
                height: `${crop.height}px`
              }}
            />
          )}
          
          <div
            className="crop-overlay"
            style={{
              left: `${crop.x}px`,
              top: `${crop.y}px`,
              width: `${crop.width}px`,
              height: `${crop.height}px`
            }}
            onMouseDown={handleCropAreaStart}
            onTouchStart={handleCropAreaStart}
          >
            <div 
              className="crop-handle handle-tl" 
              onMouseDown={(e) => handleResizeStart('tl', e)}
              onTouchStart={(e) => handleResizeStart('tl', e)}
            />
            <div 
              className="crop-handle handle-tr" 
              onMouseDown={(e) => handleResizeStart('tr', e)}
              onTouchStart={(e) => handleResizeStart('tr', e)}
            />
            <div 
              className="crop-handle handle-bl" 
              onMouseDown={(e) => handleResizeStart('bl', e)}
              onTouchStart={(e) => handleResizeStart('bl', e)}
            />
            <div 
              className="crop-handle handle-br" 
              onMouseDown={(e) => handleResizeStart('br', e)}
              onTouchStart={(e) => handleResizeStart('br', e)}
            />
          </div>
          </div>
        </div>
        
        <div className="cropper-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleCrop}>
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  )
}

export default ImageCropper

