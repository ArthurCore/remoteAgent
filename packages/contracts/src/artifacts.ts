import { z } from "zod";

import {
  ChannelMemberJoinedV1,
  ChannelMemberLeftV1,
  ChannelMemberRevokedV1,
  DurableEventV1,
  EventEnvelopeV1,
  MessageCreatedV1,
  MessageDeletedV1,
  MessageEditedV1,
  ReactionChangedV1,
  ResolvedMentionItemV1,
  VersionAfterCreateV1,
} from "./events.js";
import {
  ActorV1,
  CursorV1,
  EventSeqV1,
  EventTypeV1,
  OpaqueIdV1,
  UtcTimestampV1,
} from "./primitives.js";
import {
  BarrierAppliedResultV1,
  DeltaResponseV1,
  snapshotResponseV1,
  SubscribeResultV1,
  SyncBarrierAppliedV1,
  SyncDeliveryV1,
  SyncErrorCodeV1,
  SyncErrorV1,
  SyncItemV1,
  SyncLimitsV1,
  SyncLiveV1,
  SyncResyncRequiredV1,
  SyncRevokedV1,
  SyncSubscribeV1,
  SyncSubscriptionReadyV1,
  SyncUnsubscribeV1,
  TransportAckV1,
} from "./sync.js";

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type SyncArtifactBuildInput =
  | Readonly<{ mode: "core" }>
  | Readonly<{
      mode: "full";
      snapshotState: z.ZodObject<z.core.$ZodLooseShape, z.core.$ZodObjectConfig>;
    }>;

type ArtifactModule = "primitives" | "events" | "sync";
type ArtifactRole = "primitive" | "concrete-component" | "abstract-base" | "production-root";

type SyncArtifactRegistryEntry = Readonly<{
  name: string;
  module: ArtifactModule;
  role: ArtifactRole;
  schema: z.ZodType;
}>;

type SyncArtifactGenericFactory = Readonly<{
  name: string;
  blockedOperationId: string;
  requiresAuthoritativeState: boolean;
}>;

export const syncArtifactRegistryV1 = Object.freeze([
  Object.freeze({
    name: "OpaqueIdV1",
    module: "primitives",
    role: "primitive",
    schema: OpaqueIdV1,
  }),
  Object.freeze({ name: "CursorV1", module: "primitives", role: "primitive", schema: CursorV1 }),
  Object.freeze({
    name: "EventSeqV1",
    module: "primitives",
    role: "primitive",
    schema: EventSeqV1,
  }),
  Object.freeze({
    name: "UtcTimestampV1",
    module: "primitives",
    role: "primitive",
    schema: UtcTimestampV1,
  }),
  Object.freeze({
    name: "EventTypeV1",
    module: "primitives",
    role: "primitive",
    schema: EventTypeV1,
  }),
  Object.freeze({ name: "ActorV1", module: "primitives", role: "primitive", schema: ActorV1 }),
  Object.freeze({
    name: "ResolvedMentionItemV1",
    module: "events",
    role: "concrete-component",
    schema: ResolvedMentionItemV1,
  }),
  Object.freeze({
    name: "VersionAfterCreateV1",
    module: "events",
    role: "concrete-component",
    schema: VersionAfterCreateV1,
  }),
  Object.freeze({
    name: "EventEnvelopeV1",
    module: "events",
    role: "abstract-base",
    schema: EventEnvelopeV1,
  }),
  Object.freeze({
    name: "MessageCreatedV1",
    module: "events",
    role: "concrete-component",
    schema: MessageCreatedV1,
  }),
  Object.freeze({
    name: "MessageEditedV1",
    module: "events",
    role: "concrete-component",
    schema: MessageEditedV1,
  }),
  Object.freeze({
    name: "MessageDeletedV1",
    module: "events",
    role: "concrete-component",
    schema: MessageDeletedV1,
  }),
  Object.freeze({
    name: "ReactionChangedV1",
    module: "events",
    role: "concrete-component",
    schema: ReactionChangedV1,
  }),
  Object.freeze({
    name: "ChannelMemberJoinedV1",
    module: "events",
    role: "concrete-component",
    schema: ChannelMemberJoinedV1,
  }),
  Object.freeze({
    name: "ChannelMemberLeftV1",
    module: "events",
    role: "concrete-component",
    schema: ChannelMemberLeftV1,
  }),
  Object.freeze({
    name: "ChannelMemberRevokedV1",
    module: "events",
    role: "concrete-component",
    schema: ChannelMemberRevokedV1,
  }),
  Object.freeze({
    name: "DurableEventV1",
    module: "events",
    role: "production-root",
    schema: DurableEventV1,
  }),
  Object.freeze({
    name: "SyncItemV1",
    module: "sync",
    role: "concrete-component",
    schema: SyncItemV1,
  }),
  Object.freeze({
    name: "DeltaResponseV1",
    module: "sync",
    role: "production-root",
    schema: DeltaResponseV1,
  }),
  Object.freeze({
    name: "SyncLimitsV1",
    module: "sync",
    role: "concrete-component",
    schema: SyncLimitsV1,
  }),
  Object.freeze({
    name: "SyncSubscribeV1",
    module: "sync",
    role: "production-root",
    schema: SyncSubscribeV1,
  }),
  Object.freeze({
    name: "SyncSubscriptionReadyV1",
    module: "sync",
    role: "concrete-component",
    schema: SyncSubscriptionReadyV1,
  }),
  Object.freeze({
    name: "SyncBarrierAppliedV1",
    module: "sync",
    role: "production-root",
    schema: SyncBarrierAppliedV1,
  }),
  Object.freeze({
    name: "SyncDeliveryV1",
    module: "sync",
    role: "production-root",
    schema: SyncDeliveryV1,
  }),
  Object.freeze({
    name: "TransportAckV1",
    module: "sync",
    role: "production-root",
    schema: TransportAckV1,
  }),
  Object.freeze({
    name: "SyncLiveV1",
    module: "sync",
    role: "production-root",
    schema: SyncLiveV1,
  }),
  Object.freeze({
    name: "SyncResyncRequiredV1",
    module: "sync",
    role: "production-root",
    schema: SyncResyncRequiredV1,
  }),
  Object.freeze({
    name: "SyncRevokedV1",
    module: "sync",
    role: "production-root",
    schema: SyncRevokedV1,
  }),
  Object.freeze({
    name: "SyncErrorCodeV1",
    module: "sync",
    role: "concrete-component",
    schema: SyncErrorCodeV1,
  }),
  Object.freeze({
    name: "SyncErrorV1",
    module: "sync",
    role: "production-root",
    schema: SyncErrorV1,
  }),
  Object.freeze({
    name: "SubscribeResultV1",
    module: "sync",
    role: "production-root",
    schema: SubscribeResultV1,
  }),
  Object.freeze({
    name: "BarrierAppliedResultV1",
    module: "sync",
    role: "production-root",
    schema: BarrierAppliedResultV1,
  }),
  Object.freeze({
    name: "SyncUnsubscribeV1",
    module: "sync",
    role: "production-root",
    schema: SyncUnsubscribeV1,
  }),
] as const satisfies readonly SyncArtifactRegistryEntry[]);

export const syncArtifactGenericFactoriesV1 = Object.freeze([
  Object.freeze({
    name: "snapshotResponseV1",
    blockedOperationId: "getChannelSyncSnapshotV1",
    requiresAuthoritativeState: true,
  }),
] as const satisfies readonly SyncArtifactGenericFactory[]);

/**
 * The reviewed registry schemas have identical input/output JSON Schema semantics except for
 * DeltaResponseV1: its non-transforming pipe exposes the bounded item array only in output mode.
 */
export const syncArtifactJsonSchemaDirectionExceptionsV1 = Object.freeze([
  "DeltaResponseV1",
] as const);

export const syncArtifactSchemaBudgetV1 = Object.freeze({
  maxUniqueNodes: 4096,
  maxFixedProperties: 4096,
  maxNesting: 128,
});

const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";
const CORE_SCOPE = "sync-v1-concrete-core";
const FULL_SCOPE = "sync-v1-concrete-full";
const SCHEMA_FILE = "./sync-v1.schema.json";
const SNAPSHOT_PATH = "/api/v1/channels/{channel_id}/sync/snapshot";
const DELTA_PATH = "/api/v1/channels/{channel_id}/sync/events";
const STATE_DEFINITION = "ChannelReplicaStateV1";
const SNAPSHOT_DEFINITION = "SnapshotResponseV1";
const ROOT_DEFINITION = "SyncWireMessageV1";

const reservedDefinitionNames = new Set([
  ...syncArtifactRegistryV1.map(({ name }) => name),
  STATE_DEFINITION,
  SNAPSHOT_DEFINITION,
  ROOT_DEFINITION,
]);

function asJsonObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object`);
  }
  return value as JsonObject;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function pointerToken(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function definitionRef(name: string): string {
  return `#/$defs/${pointerToken(name)}`;
}

const safeSnapshotMetadataKeys = new Set([
  "id",
  "title",
  "description",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
]);
const safeNestedDefinitionName = /^[A-Z][A-Za-z0-9]{0,62}V1$/;
const unsafeFixedPropertyNames = new Set(["__proto__", "constructor", "prototype", "toString"]);

type ZodSchemaInternals = Readonly<{
  _zod: Readonly<{
    def: Record<PropertyKey, unknown>;
  }>;
}>;

function isZodSchema(value: unknown): value is z.ZodType & ZodSchemaInternals {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const internals = (value as Partial<ZodSchemaInternals>)._zod;
  return (
    internals !== null &&
    typeof internals === "object" &&
    internals.def !== null &&
    typeof internals.def === "object" &&
    typeof internals.def.type === "string"
  );
}

function schemaChildPath(
  parentType: string,
  definitionKey: PropertyKey,
  parentPath: string,
  index?: number,
): string {
  let token = typeof definitionKey === "symbol" ? String(definitionKey) : definitionKey;
  if (parentType === "array" && definitionKey === "element") {
    token = "items";
  } else if (parentType === "union" && definitionKey === "options") {
    token = "anyOf";
  } else if (parentType === "intersection" && definitionKey === "left") {
    token = "allOf/0";
  } else if (parentType === "intersection" && definitionKey === "right") {
    token = "allOf/1";
  } else if (parentType === "tuple" && definitionKey === "items") {
    token = "prefixItems";
  } else if (parentType === "record" && definitionKey === "keyType") {
    token = "propertyNames";
  } else if (parentType === "record" && definitionKey === "valueType") {
    token = "additionalProperties";
  } else if (definitionKey === "catchall") {
    token = "additionalProperties";
  }

  const base = `${parentPath}/${String(token).split("/").map(pointerToken).join("/")}`;
  return index === undefined ? base : `${base}/${String(index)}`;
}

function buildSnapshotMetadataRegistry(snapshotState: z.ZodType) {
  const metadataRegistry = z.registry<Record<string, unknown>>();
  const visited = new WeakSet<object>();
  const componentOwners = new Map<string, z.ZodType>();
  const componentPaths = new Map<string, string>();
  let uniqueNodes = 0;
  let fixedProperties = 0;

  const visit = (schema: z.ZodType & ZodSchemaInternals, path: string, depth: number): void => {
    if (depth > syncArtifactSchemaBudgetV1.maxNesting) {
      throw new TypeError(
        `snapshotState Zod nesting exceeds ${String(syncArtifactSchemaBudgetV1.maxNesting)} at ${path}`,
      );
    }
    if (visited.has(schema)) {
      return;
    }
    visited.add(schema);

    uniqueNodes += 1;
    if (uniqueNodes > syncArtifactSchemaBudgetV1.maxUniqueNodes) {
      throw new TypeError(
        `snapshotState unique Zod nodes exceed ${String(syncArtifactSchemaBudgetV1.maxUniqueNodes)} at ${path}`,
      );
    }

    const metadata = z.globalRegistry.get(schema);
    if (metadata !== undefined) {
      const sanitizedMetadata: Record<string, unknown> = Object.create(null) as Record<
        string,
        unknown
      >;
      for (const key of Reflect.ownKeys(metadata)) {
        if (typeof key !== "string" || !safeSnapshotMetadataKeys.has(key)) {
          throw new TypeError(
            `snapshotState metadata at ${path} contains unapproved key ${String(key)}`,
          );
        }
        sanitizedMetadata[key] = (metadata as Record<string, unknown>)[key];
      }

      const id = sanitizedMetadata.id;
      if (schema === snapshotState) {
        if (id !== undefined && id !== STATE_DEFINITION) {
          throw new TypeError(
            `snapshotState component name must be ${STATE_DEFINITION}; received ${String(id)}`,
          );
        }
      } else if (id !== undefined) {
        if (typeof id !== "string" || !safeNestedDefinitionName.test(id)) {
          throw new TypeError(
            `snapshotState component name at ${path} must be a safe name ending in V1; received ${String(id)}`,
          );
        }
        if (reservedDefinitionNames.has(id)) {
          throw new TypeError(`snapshotState definition collision for ${id} at ${path}`);
        }
        const owner = componentOwners.get(id);
        if (owner !== undefined && owner !== schema) {
          throw new TypeError(
            `duplicate snapshotState component id ${id} at ${path}; first seen at ${String(componentPaths.get(id))}`,
          );
        }
        componentOwners.set(id, schema);
        componentPaths.set(id, path);
      }

      metadataRegistry.add(schema, sanitizedMetadata);
    }

    const definition = schema._zod.def;
    const parentType = String(definition.type);
    for (const definitionKey of Reflect.ownKeys(definition)) {
      const descriptor = Object.getOwnPropertyDescriptor(definition, definitionKey);
      if (descriptor === undefined) {
        continue;
      }

      if (parentType === "object" && definitionKey === "shape") {
        const shape = descriptor.get?.call(definition) ?? descriptor.value;
        if (shape === null || typeof shape !== "object" || Array.isArray(shape)) {
          continue;
        }
        const propertyNames = Object.keys(shape);
        fixedProperties += propertyNames.length;
        if (fixedProperties > syncArtifactSchemaBudgetV1.maxFixedProperties) {
          throw new TypeError(
            `snapshotState fixed-shape properties exceed ${String(syncArtifactSchemaBudgetV1.maxFixedProperties)} at ${path}`,
          );
        }
        for (const propertyName of propertyNames) {
          const propertyPath = `${path}/properties/${pointerToken(propertyName)}`;
          if (unsafeFixedPropertyNames.has(propertyName)) {
            throw new TypeError(
              `snapshotState fixed-shape property name ${propertyName} is unsafe at ${propertyPath}`,
            );
          }
          const child = (shape as Record<string, unknown>)[propertyName];
          if (isZodSchema(child)) {
            visit(child, propertyPath, depth + 1);
          }
        }
        continue;
      }

      if (parentType === "lazy" && definitionKey === "getter") {
        const getter = descriptor.value;
        if (typeof getter === "function") {
          let child: unknown;
          try {
            child = getter();
          } catch (error) {
            throw new TypeError(
              `snapshotState lazy schema at ${path} could not be evaluated: ${errorMessage(error)}`,
              { cause: error },
            );
          }
          if (isZodSchema(child)) {
            visit(child, path, depth + 1);
          }
        }
        continue;
      }

      if (!("value" in descriptor)) {
        continue;
      }
      const child = descriptor.value;
      if (isZodSchema(child)) {
        visit(child, schemaChildPath(parentType, definitionKey, path), depth + 1);
      } else if (Array.isArray(child)) {
        child.forEach((item, index) => {
          if (isZodSchema(item)) {
            visit(item, schemaChildPath(parentType, definitionKey, path, index), depth + 1);
          }
        });
      }
    }
  };

  if (!isZodSchema(snapshotState)) {
    throw new TypeError("snapshotState must be a Zod schema");
  }
  visit(snapshotState, "#", 0);
  return metadataRegistry;
}

function normalizeDefinition(
  value: JsonValue,
  options: Readonly<{
    stripDefinitions?: boolean;
    standaloneRootName?: string;
  }> = {},
  depth = 0,
): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeDefinition(item, options, depth + 1));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  const normalized = Object.create(null) as JsonObject;
  for (const [key, child] of Object.entries(value)) {
    if (depth === 0 && (key === "$schema" || key === "$id")) {
      continue;
    }
    if (depth === 0 && options.stripDefinitions === true && key === "$defs") {
      continue;
    }
    if (key === "$ref" && child === "#" && options.standaloneRootName !== undefined) {
      normalized[key] = definitionRef(options.standaloneRootName);
      continue;
    }
    normalized[key] = normalizeDefinition(child, options, depth + 1);
  }
  return normalized;
}

function genericFactoryMetadata(): JsonValue {
  return syncArtifactGenericFactoriesV1.map((factory) => ({
    name: factory.name,
    blockedOperationId: factory.blockedOperationId,
    requiresAuthoritativeState: factory.requiresAuthoritativeState,
  }));
}

function generateRegistryDefinitions(io: "input" | "output"): JsonObject {
  const registry = z.registry<{ id: string }>();
  for (const entry of syncArtifactRegistryV1) {
    registry.add(entry.schema, { id: entry.name });
  }

  const generated = z.toJSONSchema(registry, {
    target: "draft-2020-12",
    io,
    unrepresentable: "throw",
    metadata: z.registry(),
    uri: (id) => (id === "__shared" ? "" : definitionRef(id)),
  });

  const definitions = Object.create(null) as JsonObject;
  for (const entry of syncArtifactRegistryV1) {
    const generatedDefinition = generated.schemas[entry.name];
    if (generatedDefinition === undefined) {
      throw new Error(`Zod did not generate the registered ${entry.name} definition`);
    }
    definitions[entry.name] = normalizeDefinition(asJsonObject(generatedDefinition, entry.name));
  }

  const sharedDocument = generated.schemas.__shared;
  if (sharedDocument !== undefined) {
    const sharedDefinitions = asJsonObject(
      asJsonObject(sharedDocument, "Zod shared schema document").$defs,
      "Zod shared $defs",
    );
    for (const [name, definition] of Object.entries(sharedDefinitions)) {
      if (Object.hasOwn(definitions, name) || reservedDefinitionNames.has(name)) {
        throw new Error(`Generated JSON Schema definition collision for ${name}`);
      }
      definitions[name] = normalizeDefinition(definition);
    }
  }

  return definitions;
}

function jsonValuesSemanticallyEqual(left: JsonValue, right: JsonValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => jsonValuesSemanticallyEqual(item, right[index] as JsonValue))
    );
  }
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return Object.is(left, right);
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        left[key] !== undefined &&
        right[key] !== undefined &&
        jsonValuesSemanticallyEqual(left[key], right[key]),
    )
  );
}

function assertDeltaResponseDirectionException(
  inputDefinition: JsonObject,
  outputDefinition: JsonObject,
): void {
  const inputProperties = asJsonObject(
    inputDefinition.properties,
    "DeltaResponseV1 input properties",
  );
  const outputProperties = asJsonObject(
    outputDefinition.properties,
    "DeltaResponseV1 output properties",
  );
  const inputItems = asJsonObject(inputProperties.items, "DeltaResponseV1 input items");
  const outputItems = asJsonObject(outputProperties.items, "DeltaResponseV1 output items");
  const reviewedOutputItems: JsonObject = {
    maxItems: 500,
    type: "array",
    items: { $ref: definitionRef("SyncItemV1") },
  };
  const reviewedOutputDefinition: JsonObject = {
    ...inputDefinition,
    properties: {
      ...inputProperties,
      items: reviewedOutputItems,
    },
  };

  if (!jsonValuesSemanticallyEqual(inputItems, {})) {
    throw new TypeError(
      "DeltaResponseV1 input JSON Schema items changed; output direction cannot be substituted or broadened",
    );
  }
  if (
    !jsonValuesSemanticallyEqual(outputItems, reviewedOutputItems) ||
    !jsonValuesSemanticallyEqual(outputDefinition, reviewedOutputDefinition)
  ) {
    throw new TypeError(
      "Unexplained input/output JSON Schema divergence for DeltaResponseV1 beyond its reviewed bounded items exception",
    );
  }
}

function buildRegistryDefinitions(): JsonObject {
  const inputDefinitions = generateRegistryDefinitions("input");
  const outputDefinitions = generateRegistryDefinitions("output");
  const inputNames = Object.keys(inputDefinitions).sort();
  const outputNames = Object.keys(outputDefinitions).sort();

  if (!jsonValuesSemanticallyEqual(inputNames, outputNames)) {
    throw new TypeError("Unexplained input/output JSON Schema registry definition-set divergence");
  }

  const directionExceptions = new Set<string>(syncArtifactJsonSchemaDirectionExceptionsV1);
  for (const name of outputNames) {
    const inputDefinition = asJsonObject(
      inputDefinitions[name],
      `${name} input registry definition`,
    );
    const outputDefinition = asJsonObject(
      outputDefinitions[name],
      `${name} output registry definition`,
    );

    if (directionExceptions.has(name)) {
      if (name !== "DeltaResponseV1") {
        throw new TypeError(`Unimplemented JSON Schema direction exception for ${name}`);
      }
      assertDeltaResponseDirectionException(inputDefinition, outputDefinition);
      continue;
    }
    if (!jsonValuesSemanticallyEqual(inputDefinition, outputDefinition)) {
      throw new TypeError(`Unexplained input/output JSON Schema divergence for ${name}`);
    }
  }

  for (const name of directionExceptions) {
    if (!Object.hasOwn(outputDefinitions, name)) {
      throw new TypeError(`Stale JSON Schema direction exception for ${name}`);
    }
  }

  return outputDefinitions;
}

type FullStateDefinitions = Readonly<{
  state: JsonObject;
  nested: JsonObject;
  wrapper: JsonObject;
}>;

const schemaMapKeywords = [
  "$defs",
  "definitions",
  "properties",
  "patternProperties",
  "dependentSchemas",
] as const;
const schemaArrayKeywords = ["allOf", "anyOf", "oneOf", "prefixItems"] as const;
const schemaValueKeywords = [
  "additionalProperties",
  "unevaluatedProperties",
  "propertyNames",
  "contains",
  "contentSchema",
  "if",
  "then",
  "else",
  "not",
  "items",
  "unevaluatedItems",
] as const;

function assertStrictFixedObjectSchemas(
  schema: JsonValue,
  label: "input" | "output",
  path = "#",
): void {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    return;
  }

  if (Object.hasOwn(schema, "properties") && schema.additionalProperties !== false) {
    throw new TypeError(
      `snapshotState must be strict: ${label} JSON Schema fixed object at ${path} must set additionalProperties to false`,
    );
  }

  for (const keyword of schemaMapKeywords) {
    const child = schema[keyword];
    if (child === undefined) {
      continue;
    }
    const schemaMap = asJsonObject(child, `snapshotState ${label} JSON Schema ${path}/${keyword}`);
    for (const [name, nestedSchema] of Object.entries(schemaMap)) {
      assertStrictFixedObjectSchemas(
        nestedSchema,
        label,
        `${path}/${pointerToken(keyword)}/${pointerToken(name)}`,
      );
    }
  }

  for (const keyword of schemaArrayKeywords) {
    const child = schema[keyword];
    if (child === undefined) {
      continue;
    }
    if (!Array.isArray(child)) {
      throw new TypeError(`snapshotState ${label} JSON Schema ${path}/${keyword} must be an array`);
    }
    child.forEach((nestedSchema, index) => {
      assertStrictFixedObjectSchemas(
        nestedSchema,
        label,
        `${path}/${pointerToken(keyword)}/${String(index)}`,
      );
    });
  }

  for (const keyword of schemaValueKeywords) {
    const child = schema[keyword];
    if (child === undefined) {
      continue;
    }
    if (Array.isArray(child)) {
      child.forEach((nestedSchema, index) => {
        assertStrictFixedObjectSchemas(
          nestedSchema,
          label,
          `${path}/${pointerToken(keyword)}/${String(index)}`,
        );
      });
    } else {
      assertStrictFixedObjectSchemas(child, label, `${path}/${pointerToken(keyword)}`);
    }
  }
}

function convertStrictSnapshotState(snapshotState: unknown): FullStateDefinitions {
  if (!(snapshotState instanceof z.ZodObject)) {
    throw new TypeError("snapshotState must be a Zod object");
  }
  const metadata = buildSnapshotMetadataRegistry(snapshotState);

  let inputDocument: JsonObject;
  let outputDocument: JsonObject;
  try {
    inputDocument = asJsonObject(
      z.toJSONSchema(snapshotState, {
        target: "draft-2020-12",
        io: "input",
        unrepresentable: "throw",
        metadata,
      }),
      "snapshotState input JSON Schema",
    );
    outputDocument = asJsonObject(
      z.toJSONSchema(snapshotState, {
        target: "draft-2020-12",
        io: "output",
        unrepresentable: "throw",
        metadata,
      }),
      "snapshotState output JSON Schema",
    );
  } catch (error) {
    throw new TypeError(
      `snapshotState must be representable as JSON Schema: ${errorMessage(error)}`,
      { cause: error },
    );
  }

  for (const [label, document] of [
    ["input", inputDocument],
    ["output", outputDocument],
  ] as const) {
    if (document.type !== "object") {
      throw new TypeError(`snapshotState ${label} JSON Schema must describe an object`);
    }
    assertStrictFixedObjectSchemas(document, label);
  }

  const nested = Object.create(null) as JsonObject;
  if (inputDocument.$defs !== undefined) {
    const nestedDefinitions = asJsonObject(inputDocument.$defs, "snapshotState $defs");
    for (const [name, definition] of Object.entries(nestedDefinitions)) {
      if (reservedDefinitionNames.has(name)) {
        throw new TypeError(`snapshotState definition collision for ${name}`);
      }
      nested[name] = normalizeDefinition(definition, {
        standaloneRootName: STATE_DEFINITION,
      });
    }
  }

  const state = asJsonObject(
    normalizeDefinition(inputDocument, {
      stripDefinitions: true,
      standaloneRootName: STATE_DEFINITION,
    }),
    STATE_DEFINITION,
  );

  let wrapperDocument: JsonObject;
  try {
    wrapperDocument = asJsonObject(
      z.toJSONSchema(snapshotResponseV1(snapshotState), {
        target: "draft-2020-12",
        io: "input",
        unrepresentable: "throw",
        metadata,
      }),
      `${SNAPSHOT_DEFINITION} JSON Schema`,
    );
  } catch (error) {
    throw new TypeError(
      `${SNAPSHOT_DEFINITION} must be representable as JSON Schema: ${errorMessage(error)}`,
      { cause: error },
    );
  }

  const wrapper = asJsonObject(
    normalizeDefinition(wrapperDocument, { stripDefinitions: true }),
    SNAPSHOT_DEFINITION,
  );
  if (wrapper.type !== "object" || wrapper.additionalProperties !== false) {
    throw new TypeError(`${SNAPSHOT_DEFINITION} must remain a strict JSON object schema`);
  }
  const wrapperProperties = asJsonObject(wrapper.properties, `${SNAPSHOT_DEFINITION}.properties`);
  if (wrapperProperties.state === undefined) {
    throw new TypeError(`${SNAPSHOT_DEFINITION} must contain a state property`);
  }
  wrapperProperties.state = { $ref: definitionRef(STATE_DEFINITION) };

  return { state, nested, wrapper };
}

function artifactMode(input: SyncArtifactBuildInput): "core" | "full" {
  if (input.mode === "core" || input.mode === "full") {
    return input.mode;
  }
  throw new TypeError("Sync artifact mode must be core or full");
}

function productionRootDefinition(includeSnapshot: boolean): JsonObject {
  const anyOf: JsonValue[] = syncArtifactRegistryV1
    .filter(({ role }) => role === "production-root")
    .map(({ name }) => ({ $ref: definitionRef(name) }));
  if (includeSnapshot) {
    anyOf.push({ $ref: definitionRef(SNAPSHOT_DEFINITION) });
  }
  return { anyOf };
}

const forbiddenSchemaStructureKeywords = [
  "$id",
  "$anchor",
  "$dynamicAnchor",
  "$dynamicRef",
] as const;

function localReferenceResolves(document: JsonObject, reference: string): boolean {
  if (reference === "#") {
    return true;
  }
  if (!reference.startsWith("#/")) {
    return false;
  }

  let current: JsonValue = document;
  for (const rawToken of reference.slice(2).split("/")) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/.test(token)) {
        return false;
      }
      const index = Number(token);
      if (!Number.isSafeInteger(index) || !Object.hasOwn(current, index)) {
        return false;
      }
      current = current[index] as JsonValue;
    } else if (current !== null && typeof current === "object") {
      if (!Object.hasOwn(current, token)) {
        return false;
      }
      current = current[token] as JsonValue;
    } else {
      return false;
    }
  }
  return true;
}

function assertSafeSchemaDocument(
  document: JsonObject,
  value: JsonValue = document,
  path = "#",
  visited = new WeakSet<object>(),
): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (visited.has(value)) {
    return;
  }
  visited.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertSafeSchemaDocument(document, item, `${path}/${String(index)}`, visited);
    });
    return;
  }

  for (const keyword of forbiddenSchemaStructureKeywords) {
    if (Object.hasOwn(value, keyword)) {
      throw new TypeError(
        `Generated JSON Schema contains forbidden structural keyword ${keyword} at ${path}/${pointerToken(keyword)}`,
      );
    }
  }

  if (Object.hasOwn(value, "$ref")) {
    const reference = value.$ref;
    if (typeof reference !== "string" || !reference.startsWith("#")) {
      throw new TypeError(
        `Generated JSON Schema contains a non-local $ref at ${path}/$ref: ${String(reference)}`,
      );
    }
    if (!localReferenceResolves(document, reference)) {
      throw new TypeError(
        `Generated JSON Schema contains a dangling $ref at ${path}/$ref: ${reference}`,
      );
    }
  }

  for (const [key, child] of Object.entries(value)) {
    assertSafeSchemaDocument(document, child, `${path}/${pointerToken(key)}`, visited);
  }
}

export function buildSyncJsonSchemaV1(input: SyncArtifactBuildInput): JsonObject {
  const mode = artifactMode(input);
  const definitions = buildRegistryDefinitions();

  if (input.mode === "full") {
    const fullDefinitions = convertStrictSnapshotState(input.snapshotState);
    definitions[STATE_DEFINITION] = fullDefinitions.state;
    for (const [name, definition] of Object.entries(fullDefinitions.nested)) {
      if (Object.hasOwn(definitions, name)) {
        throw new TypeError(`snapshotState definition collision for ${name}`);
      }
      definitions[name] = definition;
    }
    definitions[SNAPSHOT_DEFINITION] = fullDefinitions.wrapper;
  }

  definitions[ROOT_DEFINITION] = productionRootDefinition(mode === "full");

  const document: JsonObject = {
    $schema: JSON_SCHEMA_DIALECT,
    "x-agent-workspace-artifact-scope": mode === "core" ? CORE_SCOPE : FULL_SCOPE,
    "x-agent-workspace-generic-factories": genericFactoryMetadata(),
    $ref: definitionRef(ROOT_DEFINITION),
    $defs: definitions,
  };
  assertSafeSchemaDocument(document);
  return document;
}

function channelIdParameter(): JsonObject {
  return {
    name: "channel_id",
    in: "path",
    required: true,
    schema: { $ref: "#/components/schemas/OpaqueIdV1" },
  };
}

function errorResponseReference(): JsonObject {
  return { $ref: "#/components/responses/SyncErrorResponse" };
}

function snapshotOperation(): JsonObject {
  return {
    get: {
      operationId: "getChannelSyncSnapshotV1",
      security: [{ SessionAuth: [] }],
      parameters: [{ $ref: "#/components/parameters/ChannelId" }],
      responses: {
        "200": {
          description: "Consistent channel replica snapshot",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SnapshotResponseV1" },
            },
          },
        },
        "401": errorResponseReference(),
        "403": errorResponseReference(),
      },
    },
  };
}

function deltaOperation(): JsonObject {
  return {
    get: {
      operationId: "getChannelSyncDeltaV1",
      security: [{ SessionAuth: [] }],
      parameters: [
        { $ref: "#/components/parameters/ChannelId" },
        {
          name: "after",
          in: "query",
          required: true,
          schema: { $ref: "#/components/schemas/CursorV1" },
        },
        {
          name: "through",
          in: "query",
          required: true,
          schema: { $ref: "#/components/schemas/CursorV1" },
        },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 500, default: 200 },
        },
      ],
      responses: {
        "200": {
          description: "Ascending, fixed-bound delta page",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DeltaResponseV1" },
            },
          },
        },
        "400": errorResponseReference(),
        "401": errorResponseReference(),
        "403": errorResponseReference(),
        "410": errorResponseReference(),
        "503": errorResponseReference(),
      },
    },
  };
}

export function buildSyncOpenApiV1(input: SyncArtifactBuildInput): JsonObject {
  const mode = artifactMode(input);
  const schemaDocument = buildSyncJsonSchemaV1(input);
  const definitions = asJsonObject(schemaDocument.$defs, "sync JSON Schema $defs");

  const paths = Object.create(null) as JsonObject;
  if (mode === "full") {
    paths[SNAPSHOT_PATH] = snapshotOperation();
  }
  paths[DELTA_PATH] = deltaOperation();

  const schemas = Object.create(null) as JsonObject;
  for (const name of Object.keys(definitions)) {
    schemas[name] = { $ref: `${SCHEMA_FILE}${definitionRef(name)}` };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Chat Sync API",
      version: "1.0.0",
    },
    "x-agent-workspace-artifact-scope": mode === "core" ? CORE_SCOPE : FULL_SCOPE,
    "x-agent-workspace-generic-factories": genericFactoryMetadata(),
    "x-agent-workspace-blocked-operations":
      mode === "core"
        ? [
            {
              operationId: "getChannelSyncSnapshotV1",
              reason: "requires follow-up authority for a strict snapshot state schema",
            },
          ]
        : [],
    paths,
    components: {
      securitySchemes: {
        SessionAuth: {
          type: "apiKey",
          in: "header",
          name: "Authorization",
        },
      },
      parameters: {
        ChannelId: channelIdParameter(),
      },
      responses: {
        SyncErrorResponse: {
          description: "Machine-readable sync failure",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SyncErrorV1" },
            },
          },
        },
      },
      schemas,
    },
  };
}

const MAX_RENDER_NESTING = 256;

function sortJsonValue(
  value: JsonValue,
  path = "#",
  depth = 0,
  active = new WeakSet<object>(),
): JsonValue {
  if (depth > MAX_RENDER_NESTING) {
    throw new TypeError(`JSON artifact nesting exceeds ${String(MAX_RENDER_NESTING)} at ${path}`);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`JSON artifact number must be finite at ${path}`);
    }
    if (Object.is(value, -0)) {
      throw new TypeError(`JSON artifact number must not be negative zero at ${path}`);
    }
    return value;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (active.has(value)) {
    throw new TypeError(`JSON artifact cycle detected at ${path}`);
  }
  active.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        sortJsonValue(item, `${path}/${String(index)}`, depth + 1, active),
      );
    }

    const sorted = Object.create(null) as JsonObject;
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child !== undefined) {
        sorted[key] = sortJsonValue(child, `${path}/${pointerToken(key)}`, depth + 1, active);
      }
    }
    return sorted;
  } finally {
    active.delete(value);
  }
}

export function renderJsonArtifact(value: JsonValue): string {
  return `${JSON.stringify(sortJsonValue(value), null, 2)}\n`;
}

export function renderSyncJsonSchemaV1(input: SyncArtifactBuildInput): string {
  return renderJsonArtifact(buildSyncJsonSchemaV1(input));
}

export function renderSyncOpenApiV1(input: SyncArtifactBuildInput): string {
  return renderJsonArtifact(buildSyncOpenApiV1(input));
}
