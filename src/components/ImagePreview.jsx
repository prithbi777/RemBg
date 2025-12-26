import './ImagePreview.css'

function ImagePreview({ image }) {
  return (
    <div className="image-preview-container">
      <img src={image} alt="Preview" className="preview-image" />
    </div>
  )
}

export default ImagePreview

