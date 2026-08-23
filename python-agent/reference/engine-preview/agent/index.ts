export {
  ALL_ENTITIES,
  ENTITY_LABELS,
  getEntityDef,
  fieldOptions,
  type EntityKey,
  type EntityDef,
  type FieldDef,
} from './catalog'
export {
  queryEntities,
  queryEntityById,
  decodeOperator,
  type QuerySpec,
  type QueryResult,
  type FilterCond,
  type FilterOp,
  type SortSpec,
} from './query'
export { agentCreate, agentUpdate, agentDelete } from './crud'
export {
  projectTree,
  projectFinancials,
  installmentSchedule,
  buyerSummary,
  paymentLedger,
  dashboardKpis,
} from './analytics'
export {
  TOOLS,
  executeTool,
  toolNames,
  getTool,
  getEntityMeta,
  type ToolDef,
  type ToolArg,
} from './registry'