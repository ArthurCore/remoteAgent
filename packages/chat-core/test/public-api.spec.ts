import { readFileSync } from "node:fs";

import * as ts from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as chatCorePublicApi from "../src/index.js";
import type {
  AppendChannelEventInput as RootAppendChannelEventInput,
  AppendChannelEventResult as RootAppendChannelEventResult,
  ChannelEventIntent as RootChannelEventIntent,
  ChannelEventTransaction as RootChannelEventTransaction,
  TrustedChannelActor as RootTrustedChannelActor,
} from "../src/index.js";
import type {
  AppendChannelEventInput as InternalAppendChannelEventInput,
  AppendChannelEventResult as InternalAppendChannelEventResult,
  ChannelEventIntent as InternalChannelEventIntent,
  ChannelEventTransaction as InternalChannelEventTransaction,
  TrustedChannelActor as InternalTrustedChannelActor,
} from "../src/modules/messaging/channel-event-journal.js";

const expectedTypeExports = [
  "TrustedChannelActor",
  "ChannelEventIntent",
  "AppendChannelEventInput",
  "AppendChannelEventResult",
  "ChannelEventTransaction",
] as const;
const publicApiSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const publicApiSourceFile = ts.createSourceFile(
  "index.ts",
  publicApiSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const typeExportDeclarations = publicApiSourceFile.statements.filter(
  (statement): statement is ts.ExportDeclaration =>
    ts.isExportDeclaration(statement) && statement.isTypeOnly,
);

function hasExportModifier(statement: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    ts
      .getModifiers(statement)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true
  );
}

describe("chat-core root public API", () => {
  it("AW010A-S2 exports exactly the five channel journal types from the root", () => {
    expect(typeExportDeclarations).toHaveLength(1);

    const [typeExportDeclaration] = typeExportDeclarations;
    const moduleSpecifier = typeExportDeclaration?.moduleSpecifier;
    const exportClause = typeExportDeclaration?.exportClause;

    expect(moduleSpecifier !== undefined && ts.isStringLiteral(moduleSpecifier)).toBe(true);
    expect(moduleSpecifier?.getText(publicApiSourceFile)).toBe(
      '"./modules/messaging/channel-event-journal.js"',
    );
    expect(exportClause !== undefined && ts.isNamedExports(exportClause)).toBe(true);
    expect(
      exportClause !== undefined && ts.isNamedExports(exportClause)
        ? exportClause.elements.map((element) => element.name.text)
        : [],
    ).toEqual(expectedTypeExports);
  });

  it("AW010A-S2 keeps root types equal to their internal declarations", () => {
    expectTypeOf<RootTrustedChannelActor>().toEqualTypeOf<InternalTrustedChannelActor>();
    expectTypeOf<RootChannelEventIntent>().toEqualTypeOf<InternalChannelEventIntent>();
    expectTypeOf<RootAppendChannelEventInput>().toEqualTypeOf<InternalAppendChannelEventInput>();
    expectTypeOf<RootAppendChannelEventResult>().toEqualTypeOf<InternalAppendChannelEventResult>();
    expectTypeOf<RootChannelEventTransaction>().toEqualTypeOf<InternalChannelEventTransaction>();
  });

  it("AW010A-S2 has no root runtime exports", () => {
    expect(Object.keys(chatCorePublicApi)).toEqual([]);
  });

  it("AW010A-S2 has no additional root type declarations", () => {
    const exportedStatements = publicApiSourceFile.statements.filter(
      (statement) => ts.isExportDeclaration(statement) || hasExportModifier(statement),
    );

    expect(exportedStatements).toHaveLength(1);
    expect(exportedStatements[0]).toBe(typeExportDeclarations[0]);
  });
});
