import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  educatorListingOffsets,
  educatorListingUrl,
  educatorMatchesQuery,
  extraNameQueries,
  listingNextUrl,
  namesFromKeywordLabels,
  searchV3Url,
  userFromUnknown,
  usersFromAutocomplete,
  usersFromListing,
  usersFromSearchV3,
} from "@inkboard/shared/educator-search";

describe("educator search matching", () => {
  it("keeps teachers whose name or username is the query, not a fuzzy neighbour", () => {
    assert.equal(educatorMatchesQuery("Chandan Jha", "ChandanJha-301", "chandan"), true);
    assert.equal(educatorMatchesQuery("Chandan Charchita Swain", "chandancharchitaswain-1832", "chandan"), true);
    assert.equal(educatorMatchesQuery("Pawan Chandani", "pawanchandani1990", "chandan"), true);
    assert.equal(educatorMatchesQuery("Chandan Sharma", "chandansharma", "chandan"), true);
    assert.equal(educatorMatchesQuery("Roman Saini", "RomanSaini", "chandan"), false);
    assert.equal(educatorMatchesQuery("Pranav Chandak", "capranavchandak", "chandan"), false);
    assert.equal(educatorMatchesQuery("Sayantan Chandra", "sayantanmath", "chandan"), false);
    assert.equal(educatorMatchesQuery("Chandan Jha", "ChandanJha-301", "chandan jha"), true);
    assert.equal(educatorMatchesQuery("Chandan Jha", "ChandanJha-301", "chandanjha-301"), true);
    assert.equal(educatorMatchesQuery("Chandan Kumar Jha", "ONDGVS4SZXRX9SJ", "chandan jha"), true);
    assert.equal(educatorMatchesQuery("Chandan Jha", "ChandanJha-301", "chandanjha"), true);
    assert.equal(educatorMatchesQuery("Abhishek Kumar Jha", "abhishek_kumarjha", "chandan jha"), false);
  });

  it("pulls teacher names out of autocomplete keyword lines", () => {
    const names = namesFromKeywordLabels(
      [
        "chandan",
        "measurements by pawan chandani",
        "hindi by chandan sharma",
        "commerce by chandan prasad",
        "electrical engineering by pawan chandani",
        "literature textbooks by someone else",
      ],
      "chandan",
    );
    assert.deepEqual(names, ["pawan chandani", "chandan sharma", "chandan prasad"]);
  });

  it("reads type=user rows from Unacademy autocomplete", () => {
    const hits = usersFromAutocomplete([
      { type: "search", label: "chandan" },
      {
        type: "user",
        label: "Chandan Jha",
        details: { username: "ChandanJha-301", uid: "ABC", avatar: "https://edge.uacdn.net/x.jpg", courses: 107, followers: 2169 },
      },
      { type: "keyword", label: "hindi by chandan sharma" },
      {
        type: "user",
        label: "Chandan Jha",
        details: { username: "ChandanJha-301", uid: "ABC" },
      },
    ]);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.username, "ChandanJha-301");
    assert.equal(hits[0]?.name, "Chandan Jha");
    assert.equal(hits[0]?.followers, 2169);
    assert.equal(hits[0]?.courseCount, 107);
  });

  it("reads search_v3 educator listing rows and collection authors", () => {
    const hits = usersFromListing([
      {
        data: {
          username: "ChandanJha-301",
          uid: "XYZ",
          first_name: "Chandan",
          last_name: "Jha",
          followers_count: 2169,
          courses_count: 107,
          avatar_v2: "https://edge.uacdn.net/studio.png",
        },
      },
      {
        data: {
          stats: { username: "guptachandan" },
          uid: "GUP",
          first_name: "Chandan",
          last_name: "Prasad",
        },
      },
      {
        type: "collection",
        data: {
          uid: "COURSE",
          author: {
            username: "chandan_sharma",
            first_name: "Chandan",
            last_name: "Sharma",
            followers_count: "4675",
          },
        },
      },
    ]);
    assert.equal(hits[0]?.username, "ChandanJha-301");
    assert.equal(hits[0]?.name, "Chandan Jha");
    assert.equal(hits[1]?.username, "guptachandan");
    assert.equal(hits[2]?.username, "chandan_sharma");
    assert.equal(hits[2]?.name, "Chandan Sharma");
    assert.match(educatorListingUrl("chandan", 10), /search_v3\/search\/listing/);
    assert.match(educatorListingUrl("chandan", 10), /offset=10/);
    assert.match(educatorListingUrl("chandan", 10), /entity_type/);
    assert.deepEqual(educatorListingOffsets(3), [0, 10, 20]);
    assert.match(searchV3Url("chandan jha"), /search_v3\/search\/\?q=chandan/);
    assert.equal(
      listingNextUrl("https://unacademy.com/api/v1/search_v3/search/listing/?q=chandan&offset=10", "chandan", 10),
      "https://unacademy.com/api/v1/search_v3/search/listing/?q=chandan&offset=10",
    );
    assert.equal(listingNextUrl(null, "chandan", 10), null);
    assert.deepEqual(
      extraNameQueries("chandan", [
        { name: "Chandan Kumar Jha" },
        { name: "Chandan Sharma" },
        { name: "Pawan Chandani" },
        { name: "Chandan Jha" },
      ]),
      ["chandan jha", "chandan sharma", "chandan chandani"],
    );
    assert.deepEqual(extraNameQueries("chandan jha", [{ name: "Chandan Jha" }]), []);
  });

  it("reads search_v3 users[] and compact username autocomplete", () => {
    const hits = usersFromSearchV3([
      {
        type: "user",
        value: {
          first_name: "Pawan",
          last_name: "Chandani",
          username: "pawanchandani1990",
          followers_count: 28061,
          courses_count: 543,
        },
      },
    ]);
    assert.equal(hits[0]?.username, "pawanchandani1990");
    const jha = userFromUnknown({
      type: "user",
      label: "Chandan Jha",
      details: { username: "ChandanJha-301", first_name: "Chandan", last_name: "Jha" },
    });
    assert.equal(jha?.username, "ChandanJha-301");
    assert.equal(jha?.name, "Chandan Jha");
  });
});
