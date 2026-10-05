// Cálculo puro da posição do tooltip, em coordenadas da viewport.
// Script clássico: injetado antes de tooltip.js e importado pelos testes (sem import/export).
(function (root) {
  function computeTooltipPosition({ anchor, tooltip, viewport, gap = 8, margin = 8 }) {
    const spaceBelow = viewport.height - anchor.bottom - gap - margin;
    const spaceAbove = anchor.top - gap - margin;
    const placement = tooltip.height <= spaceBelow || spaceBelow >= spaceAbove ? 'below' : 'above';
    const top = placement === 'below' ? anchor.bottom + gap : anchor.top - gap - tooltip.height;
    return {
      top: clamp(top, margin, viewport.height - tooltip.height - margin),
      left: clamp(anchor.left, margin, viewport.width - tooltip.width - margin),
      placement,
    };
  }

  // Se não couber, o limite mínimo vence: o canto superior esquerdo fica visível.
  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  root.dicioPosition = { computeTooltipPosition };
})(globalThis);
