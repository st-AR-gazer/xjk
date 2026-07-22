import { clamp } from "../utils.js";
import { constrainPan, transformNode } from "./camera.js";

function createKnowledgeMapInteractions(state) {
  const { canvas } = state;

  function pointerPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function nearest(event) {
    const { x, y } = pointerPoint(event);
    let best = null;
    let bestDistance = Infinity;
    for (const node of state.nodes) {
      const point = transformNode(state, node);
      if (state.mode === "3d" && point.z < -0.55) continue;
      const distance = Math.hypot(point.x - x, point.y - y);
      const reach = state.mode === "3d" ? 22 : 30;
      if (distance < bestDistance && distance < reach) {
        best = node;
        bestDistance = distance;
      }
    }
    return { node: best, x, y };
  }

  function showTooltip(node, x = 0, y = 0) {
    if (!state.tooltip) return;
    if (!node) {
      state.tooltip.style.display = "none";
      return;
    }
    const title = state.runtime.document.createElement("strong");
    const summary = state.runtime.document.createElement("span");
    title.textContent = String(node.title || "");
    summary.textContent = String(node.page.summary || "");
    state.tooltip.replaceChildren(title, summary);
    state.tooltip.style.display = "block";
    state.tooltip.style.left = `${clamp(x + 14, 12, state.width - 270)}px`;
    state.tooltip.style.top = `${clamp(y + 14, 12, state.height - 120)}px`;
  }

  function onMove(event) {
    if (state.dragPointerId === event.pointerId) {
      const point = pointerPoint(event);
      const deltaX = point.x - state.dragStartX;
      const deltaY = point.y - state.dragStartY;
      if (Math.hypot(deltaX, deltaY) > 4) state.dragMoved = true;
      if (state.mode === "3d") {
        const stepX = point.x - state.dragLastX;
        const stepY = point.y - state.dragLastY;
        state.spinY = stepX * 0.0042;
        state.spinX = stepY * 0.0032;
        state.rotY += state.spinY;
        state.rotX = clamp(state.rotX + state.spinX, -1.25, 1.25);
        state.focusTarget = null;
        state.dragLastX = point.x;
        state.dragLastY = point.y;
      } else {
        const next = constrainPan(state, state.dragStartPanX + deltaX, state.dragStartPanY + deltaY);
        state.targetPanX = next.x;
        state.targetPanY = next.y;
        if (state.reducedMotion) {
          state.panX = state.targetPanX;
          state.panY = state.targetPanY;
        }
      }
      state.hover = null;
      canvas.style.cursor = "grabbing";
      showTooltip(null);
      event.preventDefault();
      return;
    }

    const hit = nearest(event);
    state.hover = hit.node;
    canvas.style.cursor = state.hover ? "pointer" : "grab";
    showTooltip(state.hover, hit.x, hit.y);
  }

  function onLeave() {
    if (state.dragPointerId !== null) return;
    state.hover = null;
    canvas.style.cursor = "grab";
    showTooltip(null);
  }

  function onPointerDown(event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const point = pointerPoint(event);
    state.dragPointerId = event.pointerId;
    state.dragStartX = point.x;
    state.dragStartY = point.y;
    state.dragLastX = point.x;
    state.dragLastY = point.y;
    state.dragStartPanX = state.targetPanX;
    state.dragStartPanY = state.targetPanY;
    state.dragMoved = false;
    state.hover = null;
    canvas.classList.add("is-panning");
    canvas.style.cursor = "grabbing";
    showTooltip(null);
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function endPointerDrag(event) {
    if (state.dragPointerId !== event.pointerId) return;
    if (state.dragMoved) {
      state.suppressClick = true;
      state.runtime.window.setTimeout(() => {
        state.suppressClick = false;
      }, 0);
    }
    state.dragPointerId = null;
    canvas.classList.remove("is-panning");
    canvas.releasePointerCapture?.(event.pointerId);
    canvas.style.cursor = "grab";
  }

  function onClick(event) {
    if (state.suppressClick) return;
    const hit = nearest(event);
    if (hit.node) state.onSelect(hit.node.slug);
  }

  function attach() {
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", endPointerDrag);
    canvas.addEventListener("pointercancel", endPointerDrag);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);
    canvas.style.cursor = "grab";
  }

  function destroy() {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", endPointerDrag);
    canvas.removeEventListener("pointercancel", endPointerDrag);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("click", onClick);
  }

  return { attach, destroy, nearest, showTooltip };
}

export { createKnowledgeMapInteractions };
