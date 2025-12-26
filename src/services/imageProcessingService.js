/**
 * Image Processing Service
 * Handles applying solid color backgrounds to images
 */

/**
 * Apply a solid color background to an image with transparency
 * 
 * @param {string} imageDataURL - Base64 encoded image data URL (with transparency)
 * @param {string} backgroundColor - Color in hex format (#RRGGBB) or 'transparent'
 * @returns {string} - Base64 encoded image data URL with background applied
 */
export const applyBackgroundColor = (imageDataURL, backgroundColor) => {
  // If transparent, return original image
  if (backgroundColor === 'transparent') {
    return imageDataURL
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      canvas.width = img.width
      canvas.height = img.height

      // Parse hex color
      const hex = backgroundColor.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)

      // Fill canvas with background color
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw the image on top (with its transparency)
      ctx.drawImage(img, 0, 0)

      // Convert to data URL
      const dataURL = canvas.toDataURL('image/png')
      resolve(dataURL)
    }
    img.onerror = reject
    img.src = imageDataURL
  })
}

