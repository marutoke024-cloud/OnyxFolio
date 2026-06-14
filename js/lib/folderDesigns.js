// The folder-icon designs cropped from the three reference sheets (assets/folders/f01..f72.png).
// Names double as default folder labels (weirdfolders style); the user can rename freely.
const NAMES = [
  // sheet 1 — dried botanicals (f01–f24)
  'Dry Hydrangea', 'Glass Botanicals', 'Lavender Sachet', 'Dry Eucalyptus',
  'Pressed Flowers', 'Straw Folder', 'Dry Roses', 'Paper Botanics',
  'Cotton Bolls', 'Dry Asters', 'Dried Fruits & Flowers', 'Open Botanicals',
  'Dry Grasses', 'Dry Dahlia', 'Hessian Botany', 'Miniature Dome',
  'Dry Mimosa', 'Vintage Ribbon & Flowers', 'Dry Scabiosa', 'Book Botany',
  'Dry Fern', 'Dry Eryngium', 'Wild Dried Flowers', 'Antique Box',
  // sheet 2 — pantry & provisions (f25–f48)
  'Dried Fruits Mix', 'Herb & Spice Jars', 'Assorted Nuts', 'Artisan Honey',
  'Aged Cheese Wheel', 'Rustic Bread & Olives', 'Himalayan Salt Block', 'Herb-Infused Olive Oil',
  'Dried Wild Mushrooms', 'Artisanal Dry Pasta', 'Heirloom Dried Beans', 'Loose Leaf Tea',
  'Roasted Coffee Beans', 'Bean-to-Bar Chocolate', 'Cured Prosciutto Board', 'Farm-Fresh Eggs',
  'Homemade Preserves', 'Artisan Granola', 'Vintage Cookie Tin', 'Traditional Fruitcake',
  'Dried Kitchen Herbs', 'Aged Balsamic Vinegar', 'Smoked Salmon Slices', 'Dome-Covered Mini',
  // sheet 3 — wardrobe (f49–f72)
  'Denim Jacket', 'Leather Belts', 'Tweed Blazer', 'Cashmere Scarf',
  'Oxford Shirts', 'Loafers', 'Trench Coat', 'Suit Jacket',
  'Band Tee', 'Hawaiian Shirt', 'Moth-Eaten Knit', 'Track Jacket',
  'Chino Pants', 'Fleece Pullover', 'Silk Scarves', 'Overalls',
  'Canvas Totes', 'Backpack', 'Work Boots', 'Mechanical Watch',
  'Leather Gloves', 'Knit Beanie', 'Fabric Swatches', 'Tailoring Tools',
];

export const FOLDER_DESIGNS = NAMES.map((name, i) => ({
  file: `f${String(i + 1).padStart(2, '0')}.png`,
  name,
}));

/** Interleave the three themes so a fresh grid shows a varied mix. */
export const SEED_EXCLUDE = [
  'Band Tee', 'Dried Wild Mushrooms', 'Farm-Fresh Eggs', 'Dried Kitchen Herbs',
  'Tailoring Tools', 'Dome-Covered Mini', 'Antique Box', 'Knit Beanie',
  'Aged Balsamic Vinegar', 'Smoked Salmon Slices', 'Homemade Preserves',
  'Bean-to-Bar Chocolate', 'Cured Prosciutto Board',
];

export function seedDesigns(count = 30) {
  const exclude = new Set(SEED_EXCLUDE);
  const out = [];
  for (let k = 0; out.length < count && k < 24; k++) {
    for (const base of [0, 24, 48]) {
      const d = FOLDER_DESIGNS[base + k];
      if (out.length < count && d && !exclude.has(d.name)) out.push(d);
    }
  }
  return out;
}
