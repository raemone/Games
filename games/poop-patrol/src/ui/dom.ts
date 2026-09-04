/** The three lines of DOM helper the rest of the UI is built from. */

export interface ElementProps {
  readonly class?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly on?: Readonly<Record<string, (event: Event) => void>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  children: readonly (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class !== undefined) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;

  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    node.setAttribute(name, value);
  }
  for (const [name, handler] of Object.entries(props.on ?? {})) {
    node.addEventListener(name, handler);
  }
  for (const child of children) {
    node.append(child);
  }

  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.firstChild.remove();
}

/** Toggle visibility through the `hidden` property, never inline styles. */
export function show(node: HTMLElement, visible: boolean): void {
  node.hidden = !visible;
}

export function requireElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}
