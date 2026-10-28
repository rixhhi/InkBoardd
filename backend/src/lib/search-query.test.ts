import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { usernameFromQuery, usernameIfNoHits } from "@inkboard/shared/search-query";

describe("username vs search", () => {
  it("only treats @ or a profile URL as a username up front", () => {
    assert.equal(usernameFromQuery("@agsir"), "agsir");
    assert.equal(usernameFromQuery("https://unacademy.com/@agsir"), "agsir");
    assert.equal(usernameFromQuery("https://www.unacademy.com/@OmSharma"), "OmSharma");
    assert.equal(usernameFromQuery("physics"), "");
    assert.equal(usernameFromQuery("maths"), "");
    assert.equal(usernameFromQuery("agsir"), "");
  });

  it("falls back to a handle only when search returned nothing", () => {
    assert.equal(usernameIfNoHits("physics", 3), "");
    assert.equal(usernameIfNoHits("agsir", 0), "agsir");
    assert.equal(usernameIfNoHits("organic chemistry", 0), "");
    assert.equal(usernameIfNoHits("@agsir", 0), "agsir");
  });
});
