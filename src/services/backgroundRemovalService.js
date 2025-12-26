/**
 * Background Removal Service
 * 
 * This service handles background removal using TensorFlow.js BodyPix model
 * for client-side processing, or a real API if API key is provided.
 */

import * as bodyPix from '@tensorflow-models/body-pix'
import * as tf from '@tensorflow/tfjs'

// Use remove.bg API key
const API_KEY = import.meta.env.VITE_BG_REMOVAL_API_KEY
const API_URL = import.meta.env.VITE_BG_REMOVAL_API_URL

// Cache for the loaded model
let bodyPixModel = null

/**
 * Converts a data URL to a Blob
 */
const dataURLtoBlob = (dataURL) => {
  const arr = dataURL.split(',')
  const mime = arr[0].match(/:(.*?);/)[1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new Blob([u8arr], { type: mime })
}

/**
 * Load BodyPix model (cached after first load)
 */
const loadBodyPixModel = async () => {
  if (bodyPixModel) {
    return bodyPixModel
  }

  try {
    bodyPixModel = await bodyPix.load({
      architecture: 'MobileNetV1',
      outputStride: 16,
      multiplier: 0.75,
      quantBytes: 2
    })
    return bodyPixModel
  } catch (error) {
    console.error('Failed to load BodyPix model:', error)
    throw new Error('Failed to load background removal model')
  }
}

/**
 * Background removal using TensorFlow.js BodyPix model
 * This works best for images with people, but can work for other subjects too
 */
const clientSideBackgroundRemoval = async (imageDataURL) => {
  try {
    // Load model if not already loaded
    const model = await loadBodyPixModel()

    // Create image element
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = imageDataURL
    })

    // Create canvas
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = img.width
    canvas.height = img.height

    // Draw image to canvas
    ctx.drawImage(img, 0, 0)

    // STEP 1 (continued): Object Recognition - Segment the person/object
    let segmentation
    try {
      segmentation = await model.segmentPerson(img, {
        flipHorizontal: false,
        internalResolution: 'high',
        segmentationThreshold: 0.75 // Higher threshold for more confident segmentation
      })
    } catch (error) {
      // Fallback to multi-person if single person fails
      segmentation = await model.segmentMultiPerson(img, {
        flipHorizontal: false,
        internalResolution: 'high',
        segmentationThreshold: 0.75,
        maxDetections: 1
      })
    }

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    const width = canvas.width
    const height = canvas.height

    // STEP 2: Edge Detection (Matting) - Create trimap and refine edges
    const trimap = createTrimap(segmentation.data, width, height)
    
    // STEP 3: Mask Creation - Apply alpha matting for smooth edges
    const alphaMask = applyAlphaMatting(data, trimap, width, height)

    // STEP 4: Removal/Replacement - Apply the mask to make background transparent
    applyAlphaMask(data, alphaMask, width, height)

    // Put modified image data back
    ctx.putImageData(imageData, 0, 0)

    // Return as data URL
    return canvas.toDataURL('image/png')
  } catch (error) {
    console.warn('BodyPix background removal failed, using fallback algorithm:', error)
    // Fallback to improved algorithm if BodyPix fails
    return improvedAlgorithmBackgroundRemoval(imageDataURL)
  }
}

/**
 * STEP 2: Create trimap for matting (defines known foreground, known background, and unknown regions)
 */
const createTrimap = (segmentationData, width, height) => {
  const trimap = new Uint8Array(segmentationData.length)
  // 0 = known background, 128 = unknown, 255 = known foreground
  
  // First, mark known foreground and background from segmentation
  for (let i = 0; i < segmentationData.length; i++) {
    trimap[i] = segmentationData[i] === 0 ? 0 : 255
  }
  
  // Expand unknown region around edges (dilate the boundary)
  const unknownRadius = 3 // Pixels around edge to mark as unknown
  const expanded = new Uint8Array(trimap.length)
  for (let i = 0; i < trimap.length; i++) {
    expanded[i] = trimap[i]
  }
  
  for (let y = unknownRadius; y < height - unknownRadius; y++) {
    for (let x = unknownRadius; x < width - unknownRadius; x++) {
      const idx = y * width + x
      const current = trimap[idx]
      
      // Check if this is near a boundary
      let isNearBoundary = false
      for (let dy = -unknownRadius; dy <= unknownRadius && !isNearBoundary; dy++) {
        for (let dx = -unknownRadius; dx <= unknownRadius && !isNearBoundary; dx++) {
          if (dx === 0 && dy === 0) continue
          const nIdx = (y + dy) * width + (x + dx)
          if (trimap[nIdx] !== current) {
            isNearBoundary = true
          }
        }
      }
      
      if (isNearBoundary) {
        expanded[idx] = 128 // Mark as unknown for matting
      }
    }
  }
  
  return expanded
}

/**
 * STEP 3: Apply alpha matting to unknown regions using color sampling
 */
const applyAlphaMatting = (imageData, trimap, width, height) => {
  const alpha = new Uint8Array(trimap.length)
  
  // Initialize alpha from trimap
  for (let i = 0; i < trimap.length; i++) {
    if (trimap[i] === 0) {
      alpha[i] = 0 // Known background
    } else if (trimap[i] === 255) {
      alpha[i] = 255 // Known foreground
    } else {
      alpha[i] = 128 // Unknown - will be computed
    }
  }
  
  // Process unknown regions using color sampling matting
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      
      if (trimap[idx] === 128) {
        // Unknown pixel - compute alpha using color sampling
        const pixelIdx = idx * 4
        const r = imageData[pixelIdx]
        const g = imageData[pixelIdx + 1]
        const b = imageData[pixelIdx + 2]
        
        // Sample foreground and background colors
        const { fgColor, bgColor } = sampleFgBgColors(imageData, trimap, x, y, width, height)
        
        // Compute alpha using color similarity
        const computedAlpha = computeAlphaFromColors(r, g, b, fgColor, bgColor)
        alpha[idx] = Math.max(0, Math.min(255, computedAlpha))
      }
    }
  }
  
  // Smooth alpha in unknown regions
  return smoothAlpha(alpha, trimap, width, height)
}

/**
 * Sample foreground and background colors for matting
 */
const sampleFgBgColors = (imageData, trimap, x, y, width, height) => {
  const sampleRadius = 10
  const fgSamples = []
  const bgSamples = []
  
  for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
    for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
      const ny = y + dy
      const nx = x + dx
      
      if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
        const nIdx = ny * width + nx
        const pixelIdx = nIdx * 4
        const r = imageData[pixelIdx]
        const g = imageData[pixelIdx + 1]
        const b = imageData[pixelIdx + 2]
        
        if (trimap[nIdx] === 255) {
          // Known foreground
          fgSamples.push({ r, g, b })
        } else if (trimap[nIdx] === 0) {
          // Known background
          bgSamples.push({ r, g, b })
        }
      }
    }
  }
  
  // Compute average colors
  const fgColor = fgSamples.length > 0
    ? fgSamples.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), { r: 0, g: 0, b: 0 })
    : { r: 0, g: 0, b: 0 }
  
  if (fgSamples.length > 0) {
    fgColor.r = Math.floor(fgColor.r / fgSamples.length)
    fgColor.g = Math.floor(fgColor.g / fgSamples.length)
    fgColor.b = Math.floor(fgColor.b / fgSamples.length)
  }
  
  const bgColor = bgSamples.length > 0
    ? bgSamples.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), { r: 0, g: 0, b: 0 })
    : { r: 255, g: 255, b: 255 }
  
  if (bgSamples.length > 0) {
    bgColor.r = Math.floor(bgColor.r / bgSamples.length)
    bgColor.g = Math.floor(bgColor.g / bgSamples.length)
    bgColor.b = Math.floor(bgColor.b / bgSamples.length)
  }
  
  return { fgColor, bgColor }
}

/**
 * Compute alpha value from color similarity (simplified matting equation)
 */
const computeAlphaFromColors = (r, g, b, fgColor, bgColor) => {
  // Use color difference to estimate alpha
  const distToFg = colorDistance(r, g, b, fgColor.r, fgColor.g, fgColor.b)
  const distToBg = colorDistance(r, g, b, bgColor.r, bgColor.g, bgColor.b)
  const totalDist = distToFg + distToBg
  
  if (totalDist < 1) {
    // Colors are very similar, default to foreground
    return 255
  }
  
  // Alpha is inversely proportional to distance from foreground
  const alpha = 255 * (1 - distToFg / totalDist)
  return Math.max(0, Math.min(255, alpha))
}

/**
 * Smooth alpha values in unknown regions
 */
const smoothAlpha = (alpha, trimap, width, height) => {
  const smoothed = new Uint8Array(alpha.length)
  
  for (let i = 0; i < alpha.length; i++) {
    smoothed[i] = alpha[i]
  }
  
  // Apply gentle Gaussian-like smoothing only to unknown regions
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      
      if (trimap[idx] === 128) {
        // Unknown region - smooth
        let sum = 0
        let count = 0
        
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nIdx = (y + dy) * width + (x + dx)
            sum += alpha[nIdx]
            count++
          }
        }
        
        smoothed[idx] = Math.floor(sum / count)
      }
    }
  }
  
  return smoothed
}

/**
 * STEP 4: Apply alpha mask to image data
 */
const applyAlphaMask = (imageData, alphaMask, width, height) => {
  for (let i = 0; i < imageData.length; i += 4) {
    const idx = i / 4
    const alpha = alphaMask[idx] / 255
    imageData[i + 3] = Math.floor(imageData[i + 3] * alpha)
  }
}

/**
 * Find pixels that are on the edge between foreground and background
 */
const findEdgePixels = (mask, width, height) => {
  const edges = []
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const current = mask[idx]
      
      // Check if this is a boundary pixel
      let isEdge = false
      for (let dy = -1; dy <= 1 && !isEdge; dy++) {
        for (let dx = -1; dx <= 1 && !isEdge; dx++) {
          if (dx === 0 && dy === 0) continue
          const nIdx = (y + dy) * width + (x + dx)
          if (mask[nIdx] !== current) {
            isEdge = true
          }
        }
      }
      
      if (isEdge) {
        edges.push({ x, y, idx })
      }
    }
  }
  
  return edges
}

/**
 * Sample foreground and background colors around an edge pixel
 */
const sampleColorsAroundEdge = (imageData, mask, x, y, width, height) => {
  const sampleRadius = 5
  const fgColors = []
  const bgColors = []
  
  for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
    for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
      const ny = y + dy
      const nx = x + dx
      
      if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
        const nIdx = ny * width + nx
        const pixelIdx = nIdx * 4
        const r = imageData[pixelIdx]
        const g = imageData[pixelIdx + 1]
        const b = imageData[pixelIdx + 2]
        
        if (mask[nIdx] === 255) {
          fgColors.push({ r, g, b })
        } else {
          bgColors.push({ r, g, b })
        }
      }
    }
  }
  
  // Calculate average colors
  const avgFg = fgColors.length > 0 
    ? fgColors.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), { r: 0, g: 0, b: 0 })
    : { r: 0, g: 0, b: 0 }
  if (fgColors.length > 0) {
    avgFg.r = Math.floor(avgFg.r / fgColors.length)
    avgFg.g = Math.floor(avgFg.g / fgColors.length)
    avgFg.b = Math.floor(avgFg.b / fgColors.length)
  }
  
  const avgBg = bgColors.length > 0
    ? bgColors.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), { r: 0, g: 0, b: 0 })
    : { r: 255, g: 255, b: 255 }
  if (bgColors.length > 0) {
    avgBg.r = Math.floor(avgBg.r / bgColors.length)
    avgBg.g = Math.floor(avgBg.g / bgColors.length)
    avgBg.b = Math.floor(avgBg.b / bgColors.length)
  }
  
  return { fgColor: avgFg, bgColor: avgBg }
}

/**
 * Calculate color distance
 */
const colorDistance = (r1, g1, b1, r2, g2, b2) => {
  return Math.sqrt(
    Math.pow(r1 - r2, 2) +
    Math.pow(g1 - g2, 2) +
    Math.pow(b1 - b2, 2)
  )
}

/**
 * Apply gentle smoothing to remove small artifacts
 */
const applyGentleSmoothing = (mask, width, height) => {
  const smoothed = new Uint8Array(mask.length)
  
  // Copy border pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
        smoothed[idx] = mask[idx]
      }
    }
  }
  
  // Apply gentle median filter only to edge regions
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      
      // Only smooth if it's near an edge
      let isNearEdge = false
      for (let dy = -1; dy <= 1 && !isNearEdge; dy++) {
        for (let dx = -1; dx <= 1 && !isNearEdge; dx++) {
          const nIdx = (y + dy) * width + (x + dx)
          if (mask[nIdx] !== mask[idx]) {
            isNearEdge = true
          }
        }
      }
      
      if (isNearEdge) {
        // Use median of 3x3 neighborhood
        const values = []
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nIdx = (y + dy) * width + (x + dx)
            values.push(mask[nIdx])
          }
        }
        values.sort((a, b) => a - b)
        smoothed[idx] = values[4] // Median value
      } else {
        smoothed[idx] = mask[idx]
      }
    }
  }
  
  return smoothed
}

/**
 * Apply mask with smooth alpha blending for natural edges
 */
const applyMaskWithSmoothAlpha = (imageData, mask, width, height) => {
  // First pass: create distance map from edges
  const distanceMap = createDistanceMap(mask, width, height)
  
  // Apply alpha based on distance from edge
  const featherRadius = 2
  for (let i = 0; i < imageData.length; i += 4) {
    const idx = i / 4
    const distance = distanceMap[idx]
    
    if (mask[idx] === 0) {
      // Background - fully transparent
      imageData[i + 3] = 0
    } else if (distance < featherRadius) {
      // Near edge - partial transparency for smooth transition
      const alpha = Math.min(1, (distance / featherRadius) * 0.3 + 0.7)
      imageData[i + 3] = Math.floor(imageData[i + 3] * alpha)
    }
    // Deep foreground - keep original alpha
  }
}

/**
 * Create distance map from mask edges
 */
const createDistanceMap = (mask, width, height) => {
  const distances = new Float32Array(mask.length).fill(Infinity)
  
  // Initialize edge pixels with distance 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (mask[idx] === 255) {
        // Check if it's an edge
        let isEdge = false
        for (let dy = -1; dy <= 1 && !isEdge; dy++) {
          for (let dx = -1; dx <= 1 && !isEdge; dx++) {
            if (dx === 0 && dy === 0) continue
            const ny = y + dy
            const nx = x + dx
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              const nIdx = ny * width + nx
              if (mask[nIdx] === 0) {
                isEdge = true
                distances[idx] = 0
              }
            }
          }
        }
      }
    }
  }
  
  // Propagate distances (simple distance transform)
  for (let iter = 0; iter < 5; iter++) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        if (mask[idx] === 255 && distances[idx] !== 0) {
          let minDist = Infinity
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nIdx = (y + dy) * width + (x + dx)
              const dist = distances[nIdx] + Math.sqrt(dx * dx + dy * dy)
              if (dist < minDist) minDist = dist
            }
          }
          distances[idx] = Math.min(distances[idx], minDist)
        }
      }
    }
  }
  
  return distances
}


/**
 * Smooth mask edges using morphological operations
 */
const smoothMaskEdges = (mask, width, height) => {
  // Erode to remove small noise (only on edges)
  const eroded = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i++) {
    eroded[i] = mask[i]
  }
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      
      // Only erode if it's a boundary pixel
      let isBoundary = false
      for (let dy = -1; dy <= 1 && !isBoundary; dy++) {
        for (let dx = -1; dx <= 1 && !isBoundary; dx++) {
          if (mask[(y + dy) * width + (x + dx)] !== mask[idx]) {
            isBoundary = true
          }
        }
      }
      
      if (isBoundary && mask[idx] === 1) {
        // Check if should be eroded
        let foregroundNeighbors = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (mask[(y + dy) * width + (x + dx)] === 1) {
              foregroundNeighbors++
            }
          }
        }
        // If less than 5 neighbors are foreground, erode
        if (foregroundNeighbors < 5) {
          eroded[idx] = 0
        }
      }
    }
  }
  
  // Dilate to fill small gaps
  const dilated = new Uint8Array(eroded.length)
  for (let i = 0; i < eroded.length; i++) {
    dilated[i] = eroded[i]
  }
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      
      if (eroded[idx] === 0) {
        // Check if should be dilated
        let foregroundNeighbors = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (eroded[(y + dy) * width + (x + dx)] === 1) {
              foregroundNeighbors++
            }
          }
        }
        // If 5 or more neighbors are foreground, dilate
        if (foregroundNeighbors >= 5) {
          dilated[idx] = 1
        }
      }
    }
  }
  
  return dilated
}

/**
 * Improved algorithm-based background removal (fallback)
 * Uses better color-based segmentation with edge-aware processing
 */
const improvedAlgorithmBackgroundRemoval = async (imageDataURL) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      canvas.width = img.width
      canvas.height = img.height

      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const width = canvas.width
      const height = canvas.height

      // Get background color from border pixels
      const borderColors = getBorderColors(data, width, height)
      const bgColor = getDominantColor(borderColors)

      // Create mask using improved algorithm
      const mask = createImprovedMask(data, width, height, bgColor)

      // Refine mask with edge detection
      const refinedMask = refineAlgorithmMask(data, mask, width, height)

      // Apply mask with alpha feathering
      applyMaskWithFeathering(data, refinedMask, width, height)

      ctx.putImageData(imageData, 0, 0)
      const processedDataURL = canvas.toDataURL('image/png')
      resolve(processedDataURL)
    }
    img.onerror = reject
    img.src = imageDataURL
  })
}

/**
 * Get colors from border pixels (more reliable than just corners)
 */
const getBorderColors = (data, width, height) => {
  const borderSize = Math.min(30, Math.floor(width / 15), Math.floor(height / 15))
  const colors = []

  // Top border
  for (let y = 0; y < borderSize; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      colors.push([data[idx], data[idx + 1], data[idx + 2]])
    }
  }

  // Bottom border
  for (let y = height - borderSize; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      colors.push([data[idx], data[idx + 1], data[idx + 2]])
    }
  }

  // Left border
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < borderSize; x++) {
      const idx = (y * width + x) * 4
      colors.push([data[idx], data[idx + 1], data[idx + 2]])
    }
  }

  // Right border
  for (let y = 0; y < height; y++) {
    for (let x = width - borderSize; x < width; x++) {
      const idx = (y * width + x) * 4
      colors.push([data[idx], data[idx + 1], data[idx + 2]])
    }
  }

  return colors
}

/**
 * Create improved mask using color similarity and spatial information
 */
const createImprovedMask = (data, width, height, bgColor) => {
  const mask = new Uint8Array(width * height).fill(0)
  let threshold = 50 // Start with lower threshold

  const colorDistance = (r1, g1, b1, r2, g2, b2) => {
    // Use weighted color distance (more sensitive to differences)
    return Math.sqrt(
      Math.pow((r1 - r2) * 0.3, 2) +
      Math.pow((g1 - g2) * 0.59, 2) +
      Math.pow((b1 - b2) * 0.11, 2)
    )
  }

  // First pass: mark pixels similar to background, especially on borders
  for (let i = 0; i < data.length; i += 4) {
    const idx = i / 4
    const x = idx % width
    const y = Math.floor(idx / width)
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    const dist = colorDistance(r, g, b, bgColor.r, bgColor.g, bgColor.b)
    const isOnBorder = x < 30 || x > width - 30 || y < 30 || y > height - 30
    const borderThreshold = isOnBorder ? threshold * 1.8 : threshold

    if (dist < borderThreshold) {
      mask[idx] = 1
    }
  }

  // Flood fill from borders to connect background regions
  const visited = new Uint8Array(width * height).fill(0)
  const floodFill = (startX, startY) => {
    const stack = [[startX, startY]]
    const startIdx = startY * width + startX
    const startPixelIdx = startIdx * 4
    const startR = data[startPixelIdx]
    const startG = data[startPixelIdx + 1]
    const startB = data[startPixelIdx + 2]

    while (stack.length > 0) {
      const [x, y] = stack.pop()
      const idx = y * width + x

      if (x < 0 || x >= width || y < 0 || y >= height || visited[idx]) continue

      const pixelIdx = idx * 4
      const r = data[pixelIdx]
      const g = data[pixelIdx + 1]
      const b = data[pixelIdx + 2]

      const distToStart = colorDistance(r, g, b, startR, startG, startB)
      const distToBg = colorDistance(r, g, b, bgColor.r, bgColor.g, bgColor.b)

      if (distToStart < threshold * 1.5 || distToBg < threshold * 1.3) {
        visited[idx] = 1
        mask[idx] = 1

        stack.push([x + 1, y])
        stack.push([x - 1, y])
        stack.push([x, y + 1])
        stack.push([x, y - 1])
      }
    }
  }

  // Flood fill from border points with background-like colors
  const borderStep = Math.max(5, Math.floor(Math.min(width, height) / 20))
  for (let x = 0; x < width; x += borderStep) {
    const topIdx = x
    const bottomIdx = (height - 1) * width + x
    if (mask[topIdx] === 1) floodFill(x, 0)
    if (mask[bottomIdx] === 1) floodFill(x, height - 1)
  }
  for (let y = 0; y < height; y += borderStep) {
    const leftIdx = y * width
    const rightIdx = y * width + (width - 1)
    if (mask[leftIdx] === 1) floodFill(0, y)
    if (mask[rightIdx] === 1) floodFill(width - 1, y)
  }

  // Second pass: mark remaining pixels similar to already-marked background
  for (let i = 0; i < data.length; i += 4) {
    const idx = i / 4
    if (mask[idx] === 1) continue

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const dist = colorDistance(r, g, b, bgColor.r, bgColor.g, bgColor.b)

    // Check neighbors - if most neighbors are background, this might be too
    const x = idx % width
    const y = Math.floor(idx / width)
    if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
      let bgNeighbors = 0
      const neighbors = [
        mask[(y - 1) * width + x],
        mask[(y + 1) * width + x],
        mask[y * width + (x - 1)],
        mask[y * width + (x + 1)]
      ]
      bgNeighbors = neighbors.filter(v => v === 1).length

      if (bgNeighbors >= 3 && dist < threshold * 1.5) {
        mask[idx] = 1
      } else if (dist < threshold * 0.8) {
        mask[idx] = 1
      }
    }
  }

  return mask
}


/**
 * Get dominant color from corner samples
 */
const getDominantColor = (colors) => {
  const buckets = {}
  const bucketSize = 20

  colors.forEach(([r, g, b]) => {
    const key = `${Math.floor(r / bucketSize)},${Math.floor(g / bucketSize)},${Math.floor(b / bucketSize)}`
    buckets[key] = (buckets[key] || 0) + 1
  })

  let maxCount = 0
  let dominantKey = ''
  Object.keys(buckets).forEach(key => {
    if (buckets[key] > maxCount) {
      maxCount = buckets[key]
      dominantKey = key
    }
  })

  const [r, g, b] = dominantKey.split(',').map(v => parseInt(v) * bucketSize + bucketSize / 2)
  return { r, g, b }
}


/**
 * Refine algorithm mask with edge detection
 */
const refineAlgorithmMask = (imageData, mask, width, height) => {
  const edges = detectImageEdges(imageData, width, height)
  const refined = new Uint8Array(mask.length)
  
  // Copy original mask
  for (let i = 0; i < mask.length; i++) {
    refined[i] = mask[i]
  }
  
  // Refine edges
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const idx = y * width + x
      
      if (edges[idx] > 0) {
        // On an edge, check surrounding context
        let foregroundCount = 0
        let backgroundCount = 0
        
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nIdx = (y + dy) * width + (x + dx)
            if (mask[nIdx] === 1) {
              foregroundCount++
            } else {
              backgroundCount++
            }
          }
        }
        
        // If mostly foreground, keep as foreground; if mostly background, mark as background
        if (foregroundCount > backgroundCount * 1.5) {
          refined[idx] = 1
        } else if (backgroundCount > foregroundCount * 1.5) {
          refined[idx] = 0
        }
      }
    }
  }
  
  const smoothed = smoothMaskEdges(refined, width, height)
  
  // Convert to alpha values (0-255) for feathering
  const feathered = new Uint8Array(smoothed.length)
  for (let i = 0; i < smoothed.length; i++) {
    feathered[i] = smoothed[i] === 1 ? 255 : 0
  }
  
  return feathered
}

/**
 * Apply mask with feathering for smooth edges
 */
const applyMaskWithFeathering = (data, mask, width, height) => {
  for (let i = 0; i < data.length; i += 4) {
    const idx = i / 4
    
    if (mask[idx] === 0) {
      // Background - fully transparent
      data[i + 3] = 0
    } else if (mask[idx] < 255) {
      // Edge area - partial transparency for smooth transition
      const alpha = mask[idx] / 255
      data[i + 3] = Math.floor(data[i + 3] * alpha)
    }
    // Foreground pixels (mask[idx] === 255) keep original alpha
  }
}

/**
 * Apply mask to make background transparent (simple version)
 */
const applyMask = (data, mask) => {
  for (let i = 0; i < data.length; i += 4) {
    const idx = i / 4
    if (mask[idx] === 1) {
      // Make background transparent
      data[i + 3] = 0
    }
  }
}

/**
 * Real API call to remove.bg service
 */
const realBackgroundRemoval = async (imageDataURL) => {
  if (!API_KEY) {
    throw new Error('API key is not configured')
  }

  // Convert data URL to blob
  const blob = dataURLtoBlob(imageDataURL)
  
  // Create form data for remove.bg API
  const formData = new FormData()
  formData.append('image_file', blob, 'image.jpg')
  formData.append('size', 'auto') // 'auto' for best quality, or 'regular', 'hd', '4k'
  
  // Optional: Add more parameters for better results
  // formData.append('format', 'png') // png or jpg
  // formData.append('crop', 'false') // crop to fit
  // formData.append('scale', 'original') // scale option

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'X-Api-Key': API_KEY,
      },
      body: formData,
    })

    if (!response.ok) {
      // Try to get error message from response
      let errorMessage = `API request failed with status ${response.status}`
      try {
        const errorData = await response.json()
        errorMessage = errorData.error?.message || errorData.error || errorMessage
      } catch (e) {
        // If response is not JSON, try text
        try {
          const errorText = await response.text()
          if (errorText) errorMessage = errorText
        } catch (e2) {
          // Use default error message
        }
      }
      throw new Error(errorMessage)
    }

    // Get the processed image as blob
    const blobResult = await response.blob()
    
    // Convert blob to data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Failed to read processed image'))
      reader.readAsDataURL(blobResult)
    })
  } catch (error) {
    // Re-throw with more context if it's a network error
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error('Network error: Could not connect to remove.bg API. Please check your internet connection.')
    }
    throw error
  }
}

/**
 * Main function to remove background from an image
 * 
 * @param {string} imageDataURL - Base64 encoded image data URL
 * @returns {Promise<string>} - Base64 encoded processed image data URL
 */
export const removeBackground = async (imageDataURL) => {
  try {
    // Always use remove.bg API for professional results
    console.log('Using remove.bg API for background removal')
    return await realBackgroundRemoval(imageDataURL)
  } catch (error) {
    console.error('Background removal error:', error)
    // Fallback to client-side if API fails
    console.warn('API failed, falling back to client-side algorithm')
    try {
      return await clientSideBackgroundRemoval(imageDataURL)
    } catch (fallbackError) {
      throw new Error(
        error.message || 'Failed to remove background. Please try again.'
      )
    }
  }
}

