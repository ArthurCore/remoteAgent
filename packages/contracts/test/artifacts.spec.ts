import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  buildSyncJsonSchemaV1,
  buildSyncOpenApiV1,
  renderJsonArtifact,
  renderSyncJsonSchemaV1,
  renderSyncOpenApiV1,
  syncArtifactGenericFactoriesV1,
  syncArtifactJsonSchemaDirectionExceptionsV1,
  syncArtifactRegistryV1,
  syncArtifactSchemaBudgetV1,
  type JsonObject,
  type JsonValue,
  type SyncArtifactBuildInput,
} from "../src/artifacts.js";
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
} from "../src/events.js";
import {
  ActorV1,
  CursorV1,
  EventSeqV1,
  EventTypeV1,
  OpaqueIdV1,
  UtcTimestampV1,
} from "../src/primitives.js";
import {
  BarrierAppliedResultV1,
  DeltaResponseV1,
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
} from "../src/sync.js";

const CORE_SCOPE = "sync-v1-concrete-core";
const FULL_SCOPE = "sync-v1-concrete-full";
const SCHEMA_FILE = "./sync-v1.schema.json";
const SNAPSHOT_PATH = "/api/v1/channels/{channel_id}/sync/snapshot";
const DELTA_PATH = "/api/v1/channels/{channel_id}/sync/events";

const snapshotState = z
  .object({
    channel_revision: z.number().int().nonnegative(),
    members: z.array(
      z
        .object({
          principal_id: z.string().min(1),
          active: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

const NamedReplicaMemberV1 = z
  .object({
    principal_id: z.string().min(1),
    active: z.boolean(),
  })
  .strict()
  .meta({ id: "NamedReplicaMemberV1" });

const namedSnapshotState = z
  .object({
    channel_revision: z.number().int().nonnegative(),
    member: NamedReplicaMemberV1,
  })
  .strict();

const coreInput = { mode: "core" } as const;
const fullInput = { mode: "full", snapshotState } as const;

const expectedRegistry = [
  ["OpaqueIdV1", "primitives", "primitive", OpaqueIdV1],
  ["CursorV1", "primitives", "primitive", CursorV1],
  ["EventSeqV1", "primitives", "primitive", EventSeqV1],
  ["UtcTimestampV1", "primitives", "primitive", UtcTimestampV1],
  ["EventTypeV1", "primitives", "primitive", EventTypeV1],
  ["ActorV1", "primitives", "primitive", ActorV1],
  ["ResolvedMentionItemV1", "events", "concrete-component", ResolvedMentionItemV1],
  ["VersionAfterCreateV1", "events", "concrete-component", VersionAfterCreateV1],
  ["EventEnvelopeV1", "events", "abstract-base", EventEnvelopeV1],
  ["MessageCreatedV1", "events", "concrete-component", MessageCreatedV1],
  ["MessageEditedV1", "events", "concrete-component", MessageEditedV1],
  ["MessageDeletedV1", "events", "concrete-component", MessageDeletedV1],
  ["ReactionChangedV1", "events", "concrete-component", ReactionChangedV1],
  ["ChannelMemberJoinedV1", "events", "concrete-component", ChannelMemberJoinedV1],
  ["ChannelMemberLeftV1", "events", "concrete-component", ChannelMemberLeftV1],
  ["ChannelMemberRevokedV1", "events", "concrete-component", ChannelMemberRevokedV1],
  ["DurableEventV1", "events", "production-root", DurableEventV1],
  ["SyncItemV1", "sync", "concrete-component", SyncItemV1],
  ["DeltaResponseV1", "sync", "production-root", DeltaResponseV1],
  ["SyncLimitsV1", "sync", "concrete-component", SyncLimitsV1],
  ["SyncSubscribeV1", "sync", "production-root", SyncSubscribeV1],
  ["SyncSubscriptionReadyV1", "sync", "concrete-component", SyncSubscriptionReadyV1],
  ["SyncBarrierAppliedV1", "sync", "production-root", SyncBarrierAppliedV1],
  ["SyncDeliveryV1", "sync", "production-root", SyncDeliveryV1],
  ["TransportAckV1", "sync", "production-root", TransportAckV1],
  ["SyncLiveV1", "sync", "production-root", SyncLiveV1],
  ["SyncResyncRequiredV1", "sync", "production-root", SyncResyncRequiredV1],
  ["SyncRevokedV1", "sync", "production-root", SyncRevokedV1],
  ["SyncErrorCodeV1", "sync", "concrete-component", SyncErrorCodeV1],
  ["SyncErrorV1", "sync", "production-root", SyncErrorV1],
  ["SubscribeResultV1", "sync", "production-root", SubscribeResultV1],
  ["BarrierAppliedResultV1", "sync", "production-root", BarrierAppliedResultV1],
  ["SyncUnsubscribeV1", "sync", "production-root", SyncUnsubscribeV1],
] as const;

function asObject(value: JsonValue | undefined, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function decodePointerToken(token: string): string {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolvePointer(document: JsonValue, pointer: string): JsonValue | undefined {
  if (pointer === "#") {
    return document;
  }
  if (!pointer.startsWith("#/")) {
    return undefined;
  }

  let current: JsonValue | undefined = document;
  for (const rawToken of pointer.slice(2).split("/")) {
    const token = decodePointerToken(rawToken);
    if (Array.isArray(current)) {
      const index = Number(token);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else if (current !== null && typeof current === "object") {
      current = current[token];
    } else {
      return undefined;
    }
  }
  return current;
}

function collectRefs(value: JsonValue, path = "#"): Array<{ path: string; ref: string }> {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectRefs(item, `${path}/${index}`));
  }
  if (value === null || typeof value !== "object") {
    return [];
  }

  const ownRef = typeof value.$ref === "string" ? [{ path: `${path}/$ref`, ref: value.$ref }] : [];
  return [
    ...ownRef,
    ...Object.entries(value).flatMap(([key, child]) =>
      key === "$ref" ? [] : collectRefs(child, `${path}/${key}`),
    ),
  ];
}

function expectAllRefsResolve(schemaDocument: JsonObject, openApiDocument?: JsonObject): void {
  for (const { path, ref } of collectRefs(schemaDocument)) {
    expect(resolvePointer(schemaDocument, ref), `${path} -> ${ref}`).toBeDefined();
  }

  if (openApiDocument === undefined) {
    return;
  }
  for (const { path, ref } of collectRefs(openApiDocument)) {
    if (ref.startsWith(`${SCHEMA_FILE}#`)) {
      expect(
        resolvePointer(schemaDocument, ref.slice(SCHEMA_FILE.length)),
        `${path} -> ${ref}`,
      ).toBeDefined();
    } else {
      expect(resolvePointer(openApiDocument, ref), `${path} -> ${ref}`).toBeDefined();
    }
  }
}

function expectRecursivelySorted(value: JsonValue): void {
  if (Array.isArray(value)) {
    value.forEach(expectRecursivelySorted);
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }

  const keys = Object.keys(value);
  expect(keys).toEqual([...keys].sort());
  Object.values(value).forEach(expectRecursivelySorted);
}

function schemaDefinitions(document: JsonObject): JsonObject {
  return asObject(document.$defs, "$defs");
}

function productionRootRefs(document: JsonObject): string[] {
  const root = asObject(schemaDefinitions(document).SyncWireMessageV1, "SyncWireMessageV1");
  if (!Array.isArray(root.anyOf)) {
    throw new TypeError("SyncWireMessageV1.anyOf must be an array");
  }
  return root.anyOf.map((item, index) => {
    const ref = asObject(item, `SyncWireMessageV1.anyOf[${index}]`).$ref;
    if (typeof ref !== "string") {
      throw new TypeError(`SyncWireMessageV1.anyOf[${index}].$ref must be a string`);
    }
    return ref;
  });
}

describe("ordered sync artifact registry", () => {
  it("exactly covers and classifies every approved concrete runtime schema", () => {
    expect(syncArtifactRegistryV1).toHaveLength(expectedRegistry.length);
    expect(
      syncArtifactRegistryV1.map(({ name, module, role, schema }) => [name, module, role, schema]),
    ).toEqual(expectedRegistry);
    expect(new Set(syncArtifactRegistryV1.map(({ name }) => name)).size).toBe(
      expectedRegistry.length,
    );
    expect(
      syncArtifactRegistryV1.filter(({ role }) => role === "abstract-base").map(({ name }) => name),
    ).toEqual(["EventEnvelopeV1"]);
  });

  it("keeps the generic snapshot factory in separate honest metadata", () => {
    expect(syncArtifactRegistryV1.map(({ name }) => name)).not.toContain("snapshotResponseV1");
    expect(syncArtifactGenericFactoriesV1).toEqual([
      {
        name: "snapshotResponseV1",
        blockedOperationId: "getChannelSyncSnapshotV1",
        requiresAuthoritativeState: true,
      },
    ]);
  });

  it("freezes the only reviewed input/output JSON Schema direction exception", () => {
    expect(syncArtifactJsonSchemaDirectionExceptionsV1).toEqual(["DeltaResponseV1"]);
    expect(Object.isFrozen(syncArtifactJsonSchemaDirectionExceptionsV1)).toBe(true);

    const inputDelta = asObject(
      z.toJSONSchema(DeltaResponseV1, {
        target: "draft-2020-12",
        io: "input",
        unrepresentable: "throw",
      }) as JsonValue,
      "input DeltaResponseV1",
    );
    const inputItems = asObject(
      asObject(inputDelta.properties, "input DeltaResponseV1.properties").items,
      "input DeltaResponseV1.items",
    );
    const outputDelta = asObject(
      schemaDefinitions(buildSyncJsonSchemaV1(coreInput)).DeltaResponseV1,
      "output DeltaResponseV1",
    );
    const outputItems = asObject(
      asObject(outputDelta.properties, "output DeltaResponseV1.properties").items,
      "output DeltaResponseV1.items",
    );

    expect(inputItems).toEqual({});
    expect(outputItems).toEqual({
      maxItems: 500,
      type: "array",
      items: { $ref: "#/$defs/SyncItemV1" },
    });
    expect(outputItems).not.toEqual(inputItems);
  });

  it("deep-freezes public registry configuration and preserves repeated bytes after mutation attempts", () => {
    const before = [
      renderSyncJsonSchemaV1(coreInput),
      renderSyncOpenApiV1(coreInput),
      renderSyncJsonSchemaV1(fullInput),
      renderSyncOpenApiV1(fullInput),
    ];

    expect(Object.isFrozen(syncArtifactRegistryV1)).toBe(true);
    expect(syncArtifactRegistryV1.every((entry) => Object.isFrozen(entry))).toBe(true);
    expect(Object.isFrozen(syncArtifactGenericFactoriesV1)).toBe(true);
    expect(syncArtifactGenericFactoriesV1.every((entry) => Object.isFrozen(entry))).toBe(true);

    expect(() => {
      (syncArtifactRegistryV1 as unknown as Array<unknown>).push({});
    }).toThrow(TypeError);
    expect(() => {
      (syncArtifactRegistryV1[0] as unknown as { role: string }).role = "production-root";
    }).toThrow(TypeError);
    expect(() => {
      (syncArtifactGenericFactoriesV1 as unknown as Array<unknown>).push({});
    }).toThrow(TypeError);
    expect(() => {
      (
        syncArtifactGenericFactoriesV1[0] as unknown as {
          blockedOperationId: string;
        }
      ).blockedOperationId = "poisonedOperation";
    }).toThrow(TypeError);

    expect([
      renderSyncJsonSchemaV1(coreInput),
      renderSyncOpenApiV1(coreInput),
      renderSyncJsonSchemaV1(fullInput),
      renderSyncOpenApiV1(fullInput),
    ]).toEqual(before);
  });
});

describe("core JSON Schema and OpenAPI", () => {
  it("builds an exact concrete-core catalog with a production-only root union", () => {
    const document = buildSyncJsonSchemaV1(coreInput);
    const definitions = schemaDefinitions(document);
    const expectedDefinitionNames = [
      ...expectedRegistry.map(([name]) => name),
      "SyncWireMessageV1",
    ];

    expect(document.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(document["x-agent-workspace-artifact-scope"]).toBe(CORE_SCOPE);
    expect(document.$ref).toBe("#/$defs/SyncWireMessageV1");
    expect(Object.keys(definitions)).toEqual(expectedDefinitionNames);
    expect(definitions).not.toHaveProperty("ChannelReplicaStateV1");
    expect(definitions).not.toHaveProperty("SnapshotResponseV1");
    expect(productionRootRefs(document)).toEqual(
      expectedRegistry
        .filter(([, , role]) => role === "production-root")
        .map(([name]) => `#/$defs/${name}`),
    );

    for (const entry of syncArtifactRegistryV1) {
      const definition = asObject(definitions[entry.name], entry.name);
      if (definition.type === "object") {
        expect(definition.additionalProperties, entry.name).toBe(false);
      }
    }
    const delta = asObject(definitions.DeltaResponseV1, "DeltaResponseV1");
    const deltaProperties = asObject(delta.properties, "DeltaResponseV1.properties");
    expect(asObject(deltaProperties.items, "DeltaResponseV1.items").maxItems).toBe(500);
  });

  it("publishes the concrete delta operation and errors without a fake snapshot", () => {
    const document = buildSyncOpenApiV1(coreInput);
    const paths = asObject(document.paths, "paths");
    const components = asObject(document.components, "components");
    const schemas = asObject(components.schemas, "components.schemas");

    expect(document.openapi).toBe("3.1.0");
    expect(document["x-agent-workspace-artifact-scope"]).toBe(CORE_SCOPE);
    expect(paths).toHaveProperty(DELTA_PATH);
    expect(paths).not.toHaveProperty(SNAPSHOT_PATH);
    expect(schemas).not.toHaveProperty("ChannelReplicaStateV1");
    expect(schemas).not.toHaveProperty("SnapshotResponseV1");
    expect(document["x-agent-workspace-blocked-operations"]).toEqual([
      {
        operationId: "getChannelSyncSnapshotV1",
        reason: "requires follow-up authority for a strict snapshot state schema",
      },
    ]);

    const deltaGet = asObject(asObject(paths[DELTA_PATH], DELTA_PATH).get, "delta GET");
    expect(deltaGet.operationId).toBe("getChannelSyncDeltaV1");
    expect(Object.keys(asObject(deltaGet.responses, "delta responses"))).toEqual([
      "200",
      "400",
      "401",
      "403",
      "410",
      "503",
    ]);
    for (const name of Object.keys(schemas)) {
      expect(asObject(schemas[name], name).$ref).toBe(`${SCHEMA_FILE}#/$defs/${name}`);
    }
  });

  it("resolves every internal and external reference", () => {
    const schemaDocument = buildSyncJsonSchemaV1(coreInput);
    const openApiDocument = buildSyncOpenApiV1(coreInput);
    expectAllRefsResolve(schemaDocument, openApiDocument);
  });

  it("isolates authoritative core schemas from ambient global metadata without clearing it", () => {
    const previous = z.globalRegistry.get(OpaqueIdV1);
    const poison = {
      description: "ambient poison",
      $ref: "https://evil.example/core",
      $id: "https://evil.example/id",
    };
    z.globalRegistry.remove(OpaqueIdV1);
    z.globalRegistry.add(OpaqueIdV1, poison);

    try {
      const schemaDocument = buildSyncJsonSchemaV1(coreInput);
      const definition = asObject(schemaDefinitions(schemaDocument).OpaqueIdV1, "OpaqueIdV1");

      expect(definition).not.toHaveProperty("description", "ambient poison");
      expect(definition).not.toHaveProperty("$id");
      expect(definition.$ref).not.toBe("https://evil.example/core");
      expect(z.globalRegistry.has(OpaqueIdV1)).toBe(true);
      expect(z.globalRegistry.get(OpaqueIdV1)).toStrictEqual(poison);
      expectAllRefsResolve(schemaDocument, buildSyncOpenApiV1(coreInput));
    } finally {
      z.globalRegistry.remove(OpaqueIdV1);
      if (previous !== undefined) {
        z.globalRegistry.add(OpaqueIdV1, previous);
      }
    }
  });
});

describe("full snapshot mode", () => {
  it("adds the exact strict state, runtime-derived wrapper, root, API path, and external refs", () => {
    const schemaDocument = buildSyncJsonSchemaV1(fullInput);
    const openApiDocument = buildSyncOpenApiV1(fullInput);
    const definitions = schemaDefinitions(schemaDocument);
    const state = asObject(definitions.ChannelReplicaStateV1, "ChannelReplicaStateV1");
    const wrapper = asObject(definitions.SnapshotResponseV1, "SnapshotResponseV1");
    const wrapperProperties = asObject(wrapper.properties, "SnapshotResponseV1.properties");
    const paths = asObject(openApiDocument.paths, "paths");
    const schemas = asObject(asObject(openApiDocument.components, "components").schemas, "schemas");

    expect(schemaDocument["x-agent-workspace-artifact-scope"]).toBe(FULL_SCOPE);
    expect(openApiDocument["x-agent-workspace-artifact-scope"]).toBe(FULL_SCOPE);
    expect(state).toMatchObject({ type: "object", additionalProperties: false });
    expect(Object.keys(asObject(state.properties, "state.properties"))).toEqual([
      "channel_revision",
      "members",
    ]);
    expect(wrapper).toMatchObject({ type: "object", additionalProperties: false });
    expect(asObject(wrapperProperties.state, "SnapshotResponseV1.state").$ref).toBe(
      "#/$defs/ChannelReplicaStateV1",
    );
    expect(productionRootRefs(schemaDocument).at(-1)).toBe("#/$defs/SnapshotResponseV1");
    expect(paths).toHaveProperty(SNAPSHOT_PATH);
    const snapshotGet = asObject(asObject(paths[SNAPSHOT_PATH], SNAPSHOT_PATH).get, "snapshot GET");
    expect(snapshotGet.operationId).toBe("getChannelSyncSnapshotV1");
    expect(schemas.ChannelReplicaStateV1).toEqual({
      $ref: `${SCHEMA_FILE}#/$defs/ChannelReplicaStateV1`,
    });
    expect(schemas.SnapshotResponseV1).toEqual({
      $ref: `${SCHEMA_FILE}#/$defs/SnapshotResponseV1`,
    });
    expect(openApiDocument["x-agent-workspace-blocked-operations"]).toEqual([]);
    expectAllRefsResolve(schemaDocument, openApiDocument);
  });

  it("preserves strict state rejection of unknown fields in the generated bundle", () => {
    const schemaDocument = buildSyncJsonSchemaV1(fullInput);
    const GeneratedSyncWireMessageV1 = z.fromJSONSchema(schemaDocument);
    const snapshot = {
      schema_version: 1,
      tenant_id: "ten_1",
      channel_id: "chn_1",
      snapshot_id: "snp_1",
      snapshot_cursor: "cur_1",
      generated_at: "2026-08-25T12:34:56Z",
      state: {
        channel_revision: 3,
        members: [{ principal_id: "prn_1", active: true }],
      },
    };

    expect(GeneratedSyncWireMessageV1.safeParse(snapshot).success).toBe(true);
    expect(
      GeneratedSyncWireMessageV1.safeParse({
        ...snapshot,
        state: { ...snapshot.state, unapproved_projection: true },
      }).success,
    ).toBe(false);
    expect(
      GeneratedSyncWireMessageV1.safeParse({
        ...snapshot,
        state: {
          ...snapshot.state,
          members: [{ ...snapshot.state.members[0], unknown: true }],
        },
      }).success,
    ).toBe(false);
  });

  it("hoists a strict non-reserved named nested schema and resolves every core/full ref", () => {
    const namedInput = { mode: "full", snapshotState: namedSnapshotState } as const;
    const coreSchema = buildSyncJsonSchemaV1(coreInput);
    const coreOpenApi = buildSyncOpenApiV1(coreInput);
    const fullSchema = buildSyncJsonSchemaV1(namedInput);
    const fullOpenApi = buildSyncOpenApiV1(namedInput);
    const definitions = schemaDefinitions(fullSchema);
    const state = asObject(definitions.ChannelReplicaStateV1, "ChannelReplicaStateV1");
    const stateProperties = asObject(state.properties, "ChannelReplicaStateV1.properties");
    const named = asObject(definitions.NamedReplicaMemberV1, "NamedReplicaMemberV1");
    const wrapper = asObject(definitions.SnapshotResponseV1, "SnapshotResponseV1");
    const wrapperProperties = asObject(wrapper.properties, "SnapshotResponseV1.properties");
    const openApiSchemas = asObject(
      asObject(fullOpenApi.components, "components").schemas,
      "components.schemas",
    );

    expect(stateProperties.member).toEqual({ $ref: "#/$defs/NamedReplicaMemberV1" });
    expect(named).toMatchObject({ type: "object", additionalProperties: false });
    expect(asObject(named.properties, "NamedReplicaMemberV1.properties")).toHaveProperty(
      "principal_id",
    );
    expect(wrapperProperties.state).toEqual({ $ref: "#/$defs/ChannelReplicaStateV1" });
    expect(openApiSchemas.NamedReplicaMemberV1).toEqual({
      $ref: `${SCHEMA_FILE}#/$defs/NamedReplicaMemberV1`,
    });
    expectAllRefsResolve(coreSchema, coreOpenApi);
    expectAllRefsResolve(fullSchema, fullOpenApi);
  });

  it("allows typed maps while keeping their fixed-shape values strict", () => {
    const stateWithTypedMap = z
      .object({
        members_by_id: z.record(z.string(), NamedReplicaMemberV1),
      })
      .strict();
    const document = buildSyncJsonSchemaV1({ mode: "full", snapshotState: stateWithTypedMap });
    const definitions = schemaDefinitions(document);
    const state = asObject(definitions.ChannelReplicaStateV1, "ChannelReplicaStateV1");
    const properties = asObject(state.properties, "ChannelReplicaStateV1.properties");
    const typedMap = asObject(properties.members_by_id, "members_by_id");

    expect(typedMap).not.toHaveProperty("properties");
    expect(typedMap.additionalProperties).toEqual({ $ref: "#/$defs/NamedReplicaMemberV1" });
    expect(
      asObject(definitions.NamedReplicaMemberV1, "NamedReplicaMemberV1").additionalProperties,
    ).toBe(false);
    expectAllRefsResolve(
      document,
      buildSyncOpenApiV1({ mode: "full", snapshotState: stateWithTypedMap }),
    );
  });

  it("uses own-property-only null-prototype maps for definitions and OpenAPI schemas", () => {
    const input = { mode: "full", snapshotState: namedSnapshotState } as const;
    const schemaDocument = buildSyncJsonSchemaV1(input);
    const definitions = schemaDefinitions(schemaDocument);
    const state = asObject(definitions.ChannelReplicaStateV1, "ChannelReplicaStateV1");
    const properties = asObject(state.properties, "ChannelReplicaStateV1.properties");
    const openApiSchemas = asObject(
      asObject(buildSyncOpenApiV1(input).components, "components").schemas,
      "components.schemas",
    );

    expect(Object.getPrototypeOf(definitions)).toBeNull();
    expect(Object.getPrototypeOf(properties)).toBeNull();
    expect(Object.getPrototypeOf(openApiSchemas)).toBeNull();
    expect(Object.hasOwn(definitions, "NamedReplicaMemberV1")).toBe(true);
    expect(Object.hasOwn(openApiSchemas, "NamedReplicaMemberV1")).toBe(true);
    expect(Object.hasOwn(definitions, "__proto__")).toBe(false);
    expectAllRefsResolve(schemaDocument, buildSyncOpenApiV1(input));
  });

  it.each(["__proto__", "constructor", "prototype", "toString"])(
    "rejects unsafe fixed-property key %s before Zod conversion",
    (propertyName) => {
      const shape = Object.fromEntries([[propertyName, z.string()]]) as Record<string, z.ZodType>;
      const candidate = z.object(shape).strict();
      const input = { mode: "full", snapshotState: candidate } as const;
      const expected = new RegExp(
        `fixed-shape property name ${propertyName}.*#\\/properties\\/${propertyName}`,
        "i",
      );

      expect(() => buildSyncJsonSchemaV1(input)).toThrow(TypeError);
      expect(() => buildSyncJsonSchemaV1(input)).toThrow(expected);
      expect(() => buildSyncOpenApiV1(input)).toThrow(expected);
    },
  );

  it("preserves a safe near-name fixed property as an own strict schema property", () => {
    const propertyName = "__proto___safe";
    const shape = Object.fromEntries([[propertyName, z.string()]]) as Record<string, z.ZodType>;
    const input = { mode: "full", snapshotState: z.object(shape).strict() } as const;
    const schemaDocument = buildSyncJsonSchemaV1(input);
    const state = asObject(
      schemaDefinitions(schemaDocument).ChannelReplicaStateV1,
      "ChannelReplicaStateV1",
    );
    const properties = asObject(state.properties, "ChannelReplicaStateV1.properties");

    expect(Object.hasOwn(properties, propertyName)).toBe(true);
    expect(properties[propertyName]).toEqual({ type: "string" });
    expectAllRefsResolve(schemaDocument, buildSyncOpenApiV1(input));
  });

  it("preserves only approved descriptive metadata in a private full-state registry", () => {
    const AnnotatedReplicaMemberV1 = z
      .object({ value: z.string() })
      .strict()
      .meta({
        id: "AnnotatedReplicaMemberV1",
        title: "Annotated member",
        description: "Approved nested description",
        examples: [{ value: "member_1" }],
        deprecated: true,
        readOnly: true,
        writeOnly: false,
      });
    const annotatedState = z
      .object({ member: AnnotatedReplicaMemberV1 })
      .strict()
      .meta({
        id: "ChannelReplicaStateV1",
        title: "Replica state",
        description: "Approved root description",
        examples: [{ member: { value: "member_1" } }],
      });
    const schemaDocument = buildSyncJsonSchemaV1({
      mode: "full",
      snapshotState: annotatedState,
    });
    const definitions = schemaDefinitions(schemaDocument);
    const state = asObject(definitions.ChannelReplicaStateV1, "ChannelReplicaStateV1");
    const annotated = asObject(definitions.AnnotatedReplicaMemberV1, "AnnotatedReplicaMemberV1");

    expect(state).toMatchObject({
      title: "Replica state",
      description: "Approved root description",
      examples: [{ member: { value: "member_1" } }],
    });
    expect(annotated).toMatchObject({
      title: "Annotated member",
      description: "Approved nested description",
      examples: [{ value: "member_1" }],
      deprecated: true,
      readOnly: true,
      writeOnly: false,
    });
    expect(renderJsonArtifact(schemaDocument)).not.toMatch(
      /"\$(?:id|anchor|dynamicAnchor|dynamicRef)"/,
    );
    for (const { ref } of collectRefs(schemaDocument)) {
      expect(ref).toMatch(/^#\/\$defs\/[A-Z][A-Za-z0-9]{0,62}V1$/);
    }
    expectAllRefsResolve(schemaDocument);
  });

  it("rejects structural or unapproved root metadata before conversion", () => {
    const structuralRoot = z
      .object({ value: z.string() })
      .strict()
      .meta({ $ref: "https://evil.example/root" });
    const unknownRoot = z.object({ value: z.string() }).strict().meta({ vendorExtension: true });

    for (const candidate of [structuralRoot, unknownRoot]) {
      const input = { mode: "full", snapshotState: candidate } as const;
      expect(() => buildSyncJsonSchemaV1(input)).toThrow(/metadata.*#.*(?:\$ref|vendorExtension)/i);
      expect(() => buildSyncOpenApiV1(input)).toThrow(/metadata.*#.*(?:\$ref|vendorExtension)/i);
    }
  });

  it.each(["$id", "$anchor", "$dynamicAnchor", "$ref", "$dynamicRef"])(
    "rejects named-child structural metadata key %s",
    (metadataKey) => {
      const poisonedChild = z
        .object({ value: z.string() })
        .strict()
        .meta({ id: "MetadataChildV1", [metadataKey]: "https://evil.example/child" });
      const candidate = z.object({ child: poisonedChild }).strict();
      const input = { mode: "full", snapshotState: candidate } as const;

      expect(() => buildSyncJsonSchemaV1(input)).toThrow(
        new RegExp(`metadata.*child.*\\${metadataKey}`, "i"),
      );
      expect(() => buildSyncOpenApiV1(input)).toThrow(
        new RegExp(`metadata.*child.*\\${metadataKey}`, "i"),
      );
    },
  );

  it.each(["", "a/b~c", "__proto__", "constructor", "prototype", "toString"])(
    "deterministically rejects unsafe nested component id %j",
    (id) => {
      const unsafeChild = z.object({ value: z.string() }).strict().meta({ id });
      const candidate = z.object({ child: unsafeChild }).strict();
      const input = { mode: "full", snapshotState: candidate } as const;

      expect(() => buildSyncJsonSchemaV1(input)).toThrow(/component name.*safe.*V1|invalid.*id/i);
      expect(() => buildSyncOpenApiV1(input)).toThrow(/component name.*safe.*V1|invalid.*id/i);
    },
  );

  it("rejects duplicate safe nested component ids before conversion", () => {
    const LeftDuplicateV1 = z
      .object({ left: z.string() })
      .strict()
      .meta({ id: "DuplicateReplicaNodeV1" });
    const RightDuplicateV1 = z
      .object({ right: z.string() })
      .strict()
      .meta({ id: "DuplicateReplicaNodeV1" });
    const candidate = z.object({ left: LeftDuplicateV1, right: RightDuplicateV1 }).strict();

    expect(() => buildSyncJsonSchemaV1({ mode: "full", snapshotState: candidate })).toThrow(
      /duplicate.*DuplicateReplicaNodeV1.*#\/properties\/right/i,
    );
  });

  it("publishes frozen exact full-state traversal budgets", () => {
    expect(syncArtifactSchemaBudgetV1).toEqual({
      maxUniqueNodes: 4096,
      maxFixedProperties: 4096,
      maxNesting: 128,
    });
    expect(Object.isFrozen(syncArtifactSchemaBudgetV1)).toBe(true);
  });

  it("rejects a schema just above the unique-node budget with a stable path-bearing TypeError", () => {
    const variants = Array.from(
      { length: syncArtifactSchemaBudgetV1.maxUniqueNodes - 1 },
      (_, index) => z.literal(index),
    );
    const candidate = z
      .object({ value: z.union(variants as Parameters<typeof z.union>[0]) })
      .strict();
    const build = () => buildSyncJsonSchemaV1({ mode: "full", snapshotState: candidate });

    expect(build).toThrow(TypeError);
    expect(build).toThrow(/unique Zod nodes.*4096.*#/i);
  });

  it("rejects a wide schema just above the fixed-property budget before conversion", () => {
    const sharedValue = z.string();
    const shape = Object.fromEntries(
      Array.from({ length: syncArtifactSchemaBudgetV1.maxFixedProperties + 1 }, (_, index) => [
        `field_${String(index)}`,
        sharedValue,
      ]),
    );
    const candidate = z.object(shape).strict();
    const build = () => buildSyncJsonSchemaV1({ mode: "full", snapshotState: candidate });

    expect(build).toThrow(TypeError);
    expect(build).toThrow(/fixed-shape properties.*4096.*#/i);
  });

  it("rejects excessive Zod nesting without leaking a RangeError", () => {
    let nested: z.ZodType = z.string();
    for (let index = 0; index < syncArtifactSchemaBudgetV1.maxNesting; index += 1) {
      nested = z.array(nested);
    }
    const candidate = z.object({ value: nested }).strict();
    const build = () => buildSyncJsonSchemaV1({ mode: "full", snapshotState: candidate });

    expect(build).toThrow(TypeError);
    expect(build).toThrow(/nesting.*128.*#\/properties\/value/i);
  });

  it("allows recursive root and named schemas while resolving their back-edge refs", () => {
    let recursiveRootTarget: z.ZodType;
    const recursiveRoot = z
      .object({
        label: z.string(),
        child: z.lazy(() => recursiveRootTarget).optional(),
      })
      .strict();
    recursiveRootTarget = recursiveRoot;

    let recursiveNamedTarget: z.ZodType;
    const RecursiveReplicaNodeV1 = z
      .object({
        label: z.string(),
        children: z.array(z.lazy(() => recursiveNamedTarget)),
      })
      .strict()
      .meta({ id: "RecursiveReplicaNodeV1" });
    recursiveNamedTarget = RecursiveReplicaNodeV1;
    const namedRoot = z.object({ node: RecursiveReplicaNodeV1 }).strict();

    const recursiveRootDocument = buildSyncJsonSchemaV1({
      mode: "full",
      snapshotState: recursiveRoot,
    });
    const namedDocument = buildSyncJsonSchemaV1({
      mode: "full",
      snapshotState: namedRoot,
    });

    expectAllRefsResolve(recursiveRootDocument);
    expectAllRefsResolve(namedDocument);
    expect(collectRefs(recursiveRootDocument).map(({ ref }) => ref)).toContain(
      "#/$defs/ChannelReplicaStateV1",
    );
    expect(collectRefs(namedDocument).map(({ ref }) => ref)).toContain(
      "#/$defs/RecursiveReplicaNodeV1",
    );
  });

  it.each([
    ["an open object", z.object({ value: z.string() }), /strict.*additionalProperties/i],
    ["a loose object", z.object({ value: z.string() }).loose(), /strict.*additionalProperties/i],
    [
      "an implicitly open nested object",
      z.object({ nested: z.object({ value: z.string() }) }).strict(),
      /input JSON Schema.*#\/properties\/nested.*additionalProperties/i,
    ],
    [
      "a loose nested object",
      z.object({ nested: z.object({ value: z.string() }).loose() }).strict(),
      /input JSON Schema.*#\/properties\/nested.*additionalProperties/i,
    ],
    [
      "an empty loose nested object",
      z.object({ nested: z.object({}).loose() }).strict(),
      /input JSON Schema.*#\/properties\/nested.*additionalProperties/i,
    ],
    [
      "a catchall nested fixed object",
      z.object({ nested: z.object({ value: z.string() }).catchall(z.string()) }).strict(),
      /input JSON Schema.*#\/properties\/nested.*additionalProperties/i,
    ],
    [
      "an implicitly open object inside array and union schemas",
      z
        .object({
          variants: z.array(
            z.union([
              z.object({ approved: z.string() }).strict(),
              z.object({ unapproved: z.string() }),
            ]),
          ),
        })
        .strict(),
      /input JSON Schema.*#\/properties\/variants\/items\/anyOf\/1.*additionalProperties/i,
    ],
    [
      "an implicitly open named nested definition",
      z
        .object({
          nested: z.object({ value: z.string() }).meta({ id: "OpenNamedStateV1" }),
        })
        .strict(),
      /input JSON Schema.*#\/\$defs\/OpenNamedStateV1.*additionalProperties/i,
    ],
    [
      "an implicitly open fixed object used as a typed-map value",
      z
        .object({
          values: z.record(z.string(), z.object({ value: z.string() })),
        })
        .strict(),
      /input JSON Schema.*#\/properties\/values\/additionalProperties.*additionalProperties/i,
    ],
    ["a non-object", z.string(), /Zod object/i],
    [
      "a nested transform",
      z.object({ value: z.string().transform((value) => value.length) }).strict(),
      /represent.*JSON Schema|transform/i,
    ],
    [
      "an unsupported value",
      z.object({ value: z.date() }).strict(),
      /represent.*JSON Schema|date/i,
    ],
    [
      "a conflicting fixed name",
      z.object({ value: z.string() }).strict().meta({ id: "WrongStateNameV1" }),
      /ChannelReplicaStateV1.*name|name.*ChannelReplicaStateV1/i,
    ],
    [
      "a registry definition collision",
      z
        .object({
          nested: z.object({ value: z.string() }).strict().meta({ id: "OpaqueIdV1" }),
        })
        .strict(),
      /collision.*OpaqueIdV1|OpaqueIdV1.*collision/i,
    ],
  ])("rejects %s before building", (_label, candidate, message) => {
    const input = { mode: "full", snapshotState: candidate } as unknown as SyncArtifactBuildInput;
    expect(() => buildSyncJsonSchemaV1(input)).toThrow(message);
    expect(() => buildSyncOpenApiV1(input)).toThrow(message);
  });

  it("rejects a requested full artifact when no state was supplied", () => {
    const invalid = { mode: "full" } as unknown as SyncArtifactBuildInput;
    expect(() => buildSyncJsonSchemaV1(invalid)).toThrow(/snapshotState/);
    expect(() => buildSyncOpenApiV1(invalid)).toThrow(/snapshotState/);
  });
});

describe("deterministic rendering", () => {
  it("recursively sorts keys, preserves array order, and emits stable UTF-8 JSON bytes", () => {
    const value: JsonObject = {
      zebra: { second: 2, first: 1 },
      alpha: [{ z: 1, a: 2 }, "unchanged"],
    };
    const rendered = renderJsonArtifact(value);
    const parsed = JSON.parse(rendered) as JsonValue;

    expect(rendered.endsWith("\n")).toBe(true);
    expect(rendered.endsWith("\n\n")).toBe(false);
    expect(Buffer.from(rendered, "utf8").toString("utf8")).toBe(rendered);
    expect(parsed).toEqual({
      alpha: [{ a: 2, z: 1 }, "unchanged"],
      zebra: { first: 1, second: 2 },
    });
    expectRecursivelySorted(parsed);
  });

  it("rejects self and mutual cycles with stable path-bearing TypeErrors", () => {
    const self: Record<string, unknown> = {};
    self.self = self;
    const left: Record<string, unknown> = {};
    const right: Record<string, unknown> = { left };
    left.right = right;

    const renderSelf = () => renderJsonArtifact(self as JsonValue);
    const renderMutual = () => renderJsonArtifact(left as JsonValue);

    expect(renderSelf).toThrow(TypeError);
    expect(renderSelf).toThrow(/cycle.*#\/self/i);
    expect(renderMutual).toThrow(TypeError);
    expect(renderMutual).toThrow(/cycle.*#\/right\/left/i);
  });

  it("accepts a shared acyclic DAG while preserving deterministic sorting", () => {
    const shared: JsonObject = { zebra: 1, alpha: 2 };
    const dag: JsonObject = { right: shared, left: shared };

    expect(JSON.parse(renderJsonArtifact(dag))).toEqual({
      left: { alpha: 2, zebra: 1 },
      right: { alpha: 2, zebra: 1 },
    });
  });

  it("rejects excessive renderer depth with a TypeError instead of a RangeError", () => {
    const root: Record<string, unknown> = {};
    let cursor = root;
    for (let depth = 0; depth < 257; depth += 1) {
      const child: Record<string, unknown> = {};
      cursor.child = child;
      cursor = child;
    }
    const render = () => renderJsonArtifact(root as JsonValue);

    expect(render).toThrow(TypeError);
    expect(render).toThrow(/nesting.*256.*#\/child/i);
  });

  it("renders two byte-identical core and full generations", () => {
    expect(renderSyncJsonSchemaV1(coreInput)).toBe(renderSyncJsonSchemaV1(coreInput));
    expect(renderSyncOpenApiV1(coreInput)).toBe(renderSyncOpenApiV1(coreInput));
    expect(renderSyncJsonSchemaV1(fullInput)).toBe(renderSyncJsonSchemaV1(fullInput));
    expect(renderSyncOpenApiV1(fullInput)).toBe(renderSyncOpenApiV1(fullInput));
  });
});
