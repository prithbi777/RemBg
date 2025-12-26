import { useState } from 'react'
import ImageUploader from './components/ImageUploader'
import ImagePreview from './components/ImagePreview'
import LoadingSpinner from './components/LoadingSpinner'
import ColorPicker from './components/ColorPicker'
import ImageCropper from './components/ImageCropper'
import { removeBackground } from './services/backgroundRemovalService'
import { applyBackgroundColor } from './services/imageProcessingService'
import './App.css'

function App() {
  const [originalImage, setOriginalImage] = useState(null)
  const [processedImage, setProcessedImage] = useState(null)
  const [finalImage, setFinalImage] = useState(null)
  const [selectedColor, setSelectedColor] = useState('transparent')
  const [showCropper, setShowCropper] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)

  const handleImageUpload = (file) => {
    setError(null)
    setProcessedImage(null)
    
    const reader = new FileReader()
    reader.onload = (e) => {
      setOriginalImage(e.target.result)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveBackground = async () => {
    if (!originalImage) return

    setIsProcessing(true)
    setError(null)
    setFinalImage(null)

    try {
      const result = await removeBackground(originalImage)
      setProcessedImage(result)
      // Apply default transparent background initially
      setSelectedColor('transparent')
      setFinalImage(result)
    } catch (err) {
      setError(err.message || 'Failed to remove background. Please try again.')
      console.error('Background removal error:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleColorChange = async (color) => {
    setSelectedColor(color)
    if (processedImage) {
      try {
        const imageWithBackground = await applyBackgroundColor(processedImage, color)
        setFinalImage(imageWithBackground)
      } catch (err) {
        console.error('Error applying background color:', err)
        setError('Failed to apply background color')
      }
    }
  }

  const handleCrop = async (croppedImage) => {
    // Update processed image with cropped version
    setProcessedImage(croppedImage)
    
    // Apply current background color to cropped image
    if (selectedColor) {
      try {
        const imageWithBackground = await applyBackgroundColor(croppedImage, selectedColor)
        setFinalImage(imageWithBackground)
      } catch (err) {
        console.error('Error applying background color to cropped image:', err)
        setFinalImage(croppedImage)
      }
    } else {
      setFinalImage(croppedImage)
    }
    
    setShowCropper(false)
  }

  const handleCropCancel = () => {
    setShowCropper(false)
  }

  const handleReset = () => {
    setOriginalImage(null)
    setProcessedImage(null)
    setFinalImage(null)
    setSelectedColor('transparent')
    setError(null)
  }

  const handleDownload = () => {
    if (!finalImage) return

    const link = document.createElement('a')
    link.href = finalImage
    const filename = selectedColor === 'transparent' 
      ? 'background-removed.png' 
      : `background-${selectedColor.replace('#', '')}.png`
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="app-container">
      <div className="app-content">
        <header className="app-header">
          <h1 style={{color: '#00FFFF', fontSize: '2.2rem', fontWeight: 'bold'}}>Welcome to RemBg.ai</h1>
          <h1 className="app-title">Free Background Remover By Prithbiraj</h1>
          <h2 style={{color: '#FFFF00', fontSize: '1.2rem', fontWeight: 'bold'}}>PLEASE USE CHROME</h2>
          <p className="app-subtitle">Remove image backgrounds instantly with AI-powered precision</p>
        </header>

        <main className="app-main">
          {!originalImage ? (
            <ImageUploader onImageUpload={handleImageUpload} error={error} />
          ) : (
            <div className="image-processing-container">
              <div className="image-preview-section">
                <h2 className="section-title">Original Image</h2>
                <ImagePreview image={originalImage} />
              </div>

              {isProcessing && (
                <div className="processing-section">
                  <LoadingSpinner />
                  <p className="processing-text">Removing background...</p>
                  <p className="processing-subtext">First time may take longer to load the AI model</p>
                </div>
              )}

              {processedImage && !isProcessing && (
                <>
                  <div className="image-preview-section">
                    <h2 className="section-title">Background Removed</h2>
                    <ImagePreview image={finalImage || processedImage} />
                  </div>

                  <div className="color-picker-section">
                    <ColorPicker 
                      selectedColor={selectedColor}
                      onColorChange={handleColorChange}
                    />
                  </div>
                </>
              )}

              {error && (
                <div className="error-message">
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

              <div className="action-buttons">
                {!isProcessing && !processedImage && (
                  <button
                    className="btn btn-primary"
                    onClick={handleRemoveBackground}
                  >
                    Remove Background
                  </button>
                )}

                {processedImage && !isProcessing && (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={() => setShowCropper(true)}
                    >
                      Crop Image
                    </button>
                    <button
                      className="btn btn-success"
                      onClick={handleDownload}
                    >
                      Download Image
                    </button>
                  </>
                )}

                <button
                  className="btn btn-secondary"
                  onClick={handleReset}
                  disabled={isProcessing}
                >
                  {processedImage ? 'Upload New Image' : 'Reset'}
                </button>
              </div>
            </div>
          )}
        </main>

        <footer className="app-footer">
          <p>Powered by AI • Fast & Secure</p>
        </footer>
      </div>

      {showCropper && finalImage && (
        <ImageCropper
          image={finalImage}
          onCrop={handleCrop}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  )
}

export default App

