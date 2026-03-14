declare module 'elkjs/lib/elk.bundled.js' {
  import type {
    ELK,
    ELKConstructorArguments,
    ElkEdgeSection,
    ElkExtendedEdge,
    ElkLayoutAlgorithmDescription,
    ElkLayoutArguments,
    ElkLayoutCategoryDescription,
    ElkLayoutOptionDescription,
    ElkNode,
    ElkPoint,
    ElkPort,
    LayoutOptions,
  } from 'elkjs/lib/elk-api.js';

  export type {
    ElkEdgeSection,
    ElkExtendedEdge,
    ElkLayoutAlgorithmDescription,
    ElkLayoutArguments,
    ElkLayoutCategoryDescription,
    ElkLayoutOptionDescription,
    ElkNode,
    ElkPoint,
    ElkPort,
    LayoutOptions,
  };

  export default class ElkBundled implements ELK {
    constructor(args?: ELKConstructorArguments);
    layout<T extends ElkNode>(graph: T, args?: ElkLayoutArguments): Promise<Omit<T, 'children'> & { children?: (T['children'][number] & ElkNode)[] }>;
    knownLayoutAlgorithms(): Promise<ElkLayoutAlgorithmDescription[]>;
    knownLayoutOptions(): Promise<ElkLayoutOptionDescription[]>;
    knownLayoutCategories(): Promise<ElkLayoutCategoryDescription[]>;
    terminateWorker(): void;
  }
}
