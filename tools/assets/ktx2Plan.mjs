// Texture compression plan for model GLBs. Pure so it can be unit-tested.
// Without toktx: `optimize` itself converts textures to WebP (the shipped format).
// With toktx: `optimize` leaves textures alone, then two passes run: UASTC for normal maps, ETC1S for the rest.
export const NORMAL_SLOTS = 'normalTexture';
export const COLOR_SLOTS = '{baseColorTexture,emissiveTexture,occlusionTexture,metallicRoughnessTexture}';

export function texturePlan(hasToktx) {
  if (!hasToktx) return { optimizeTextureCompress: 'webp', passes: [] };
  return {
    optimizeTextureCompress: 'false',
    passes: [
      { command: 'uastc', slots: NORMAL_SLOTS },
      { command: 'etc1s', slots: COLOR_SLOTS },
    ],
  };
}
