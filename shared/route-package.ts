import { parseOutdoorGraph, type OutdoorGraph } from './outdoor-graph';
export interface RoutePackage { schemaVersion: 1; revision: number; publishedAt: string; graph: OutdoorGraph }
export function parseRoutePackage(value: unknown): RoutePackage {
  const p = value as RoutePackage;
  if (!p || p.schemaVersion !== 1 || !Number.isSafeInteger(p.revision) || p.revision < 1 || typeof p.publishedAt !== 'string' || !Number.isFinite(Date.parse(p.publishedAt))) throw new Error('Invalid offline route package.');
  const graph = parseOutdoorGraph(p.graph);
  if (!graph.verified || !graph.edges.length || !graph.nodes.some(n => n.entrance)) throw new Error('Package does not contain a published walking network.');
  return p;
}
