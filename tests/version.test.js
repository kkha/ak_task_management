import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VERSION, APP_TITLE } from "../src/version.js";

describe("VERSION", () => {
  it("package.json 의 version 과 일치한다", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8")
    );
    expect(VERSION).toBe(pkg.version);
  });

  it("유의적 버전(x.y.z) 형식이다", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("APP_TITLE 은 이름 + v버전", () => {
    expect(APP_TITLE).toBe(`AK Task Management v${VERSION}`);
  });

  it("CHANGELOG.md 에 현재 버전 항목이 있다", () => {
    const log = readFileSync(resolve(process.cwd(), "CHANGELOG.md"), "utf8");
    expect(log).toContain(`## [${VERSION}]`);
  });
});
