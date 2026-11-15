import { Field, ProductImage } from '../../components/ui';
import './ProductImageField.css';

interface ProductImageFieldProps {
  image?: string;
  productName: string;
  onSelect: (file?: File) => void;
}

export default function ProductImageField({ image, productName, onSelect }: ProductImageFieldProps) {
  return <div className="product-image-field">
    <figure className="product-image-field-preview">
      <ProductImage src={image} name={productName || 'Product image preview'} large />
      <figcaption>{image ? 'Image preview' : 'No image added'}</figcaption>
    </figure>
    <div className="product-image-field-controls">
      <Field label="Product image (optional)" hint="JPG, PNG, or WebP up to 2 MB. Saved with this local workspace.">
        <input className="input" aria-label="Choose product image" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => onSelect(event.target.files?.[0])} />
      </Field>
      <p className="product-image-field-help">{image ? 'Choose a replacement to preview it here. Save the product to apply your changes.' : 'Choose a photo to preview it here before saving the product.'}</p>
    </div>
  </div>;
}
