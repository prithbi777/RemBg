import { useState } from 'react'
import './ColorPicker.css'

const PRESET_COLORS = [
  { name: 'White', value: '#FFFFFF' },
  { name: 'Black', value: '#000000' },
  { name: 'Transparent', value: 'transparent' },
  { name: 'Red', value: '#FF0000' },
  { name: 'Blue', value: '#0066FF' },
  { name: 'Green', value: '#00FF00' },
  { name: 'Yellow', value: '#FFFF00' },
  { name: 'Purple', value: '#8000FF' },
  { name: 'Pink', value: '#FF00FF' },
  { name: 'Orange', value: '#FF8000' },
  { name: 'Gray', value: '#808080' },
  { name: 'Light Blue', value: '#87CEEB' },
]

function ColorPicker({ selectedColor, onColorChange }) {
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [customColor, setCustomColor] = useState('#FFFFFF')

  const handlePresetClick = (color) => {
    onColorChange(color)
    setShowCustomPicker(false)
  }

  const handleCustomColorChange = (e) => {
    const color = e.target.value
    setCustomColor(color)
    onColorChange(color)
  }

  return (
    <div className="color-picker-container">
      <h3 className="color-picker-title">Choose Background Color</h3>
      
      <div className="preset-colors">
        {PRESET_COLORS.map((color) => (
          <button
            key={color.value}
            className={`preset-color-btn ${selectedColor === color.value ? 'active' : ''}`}
            onClick={() => handlePresetClick(color.value)}
            style={{
              backgroundColor: color.value === 'transparent' 
                ? 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50% / 20px 20px'
                : color.value,
              border: color.value === 'transparent' ? '2px solid #ccc' : 'none'
            }}
            title={color.name}
            aria-label={color.name}
          >
            {color.value === 'transparent' && (
              <span className="transparent-icon">∅</span>
            )}
          </button>
        ))}
      </div>

      <div className="custom-color-section">
        <button
          className="custom-color-toggle"
          onClick={() => setShowCustomPicker(!showCustomPicker)}
        >
          {showCustomPicker ? 'Hide' : 'Show'} Custom Color Picker
        </button>
        
        {showCustomPicker && (
          <div className="custom-color-picker">
            <input
              type="color"
              value={customColor}
              onChange={handleCustomColorChange}
              className="color-input"
            />
            <input
              type="text"
              value={customColor}
              onChange={(e) => {
                const color = e.target.value
                setCustomColor(color)
                if (/^#[0-9A-F]{6}$/i.test(color)) {
                  onColorChange(color)
                }
              }}
              className="color-text-input"
              placeholder="#FFFFFF"
              maxLength={7}
            />
          </div>
        )}
      </div>

      {selectedColor && (
        <div className="selected-color-display">
          <span>Selected: </span>
          <span 
            className="color-preview"
            style={{
              backgroundColor: selectedColor === 'transparent'
                ? 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50% / 20px 20px'
                : selectedColor
            }}
          />
          <span className="color-value">
            {selectedColor === 'transparent' ? 'Transparent' : selectedColor}
          </span>
        </div>
      )}
    </div>
  )
}

export default ColorPicker

