import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { JevError, validateQuestions } from "../client.mts";
import {
  applyCandidateOrder,
  fingerprint,
  readRerankJson,
  rerankShortlist,
  validateShortlist,
} from "../rerank.mts";
import {
  compareReranking,
  evaluateReranking,
  main as evaluateMain,
  rankingMetrics,
  validateRerankCorpus,
} from "../rerank-eval.mts";

import type { JevRequest, Questions, ScoreAnswer, NoulAnswer } from "../client.mts";
import type { RerankClient, RerankOptions } from "../rerank.mts";
import { required, record } from "./helpers.mts";

function candidateKeys(value: unknown): string[][] {
  assert.ok(Array.isArray(value));
  return value.map((candidate: unknown) => Object.keys(record(candidate)));
}

const shortlist = () => ({
  version: 1,
  query: "hide post locally",
  sort: "relevance",
  retrieval: "fts5",
  scope: {
    page: 2,
    limit: 2,
    total: 10,
    filters: {
      nsfw: false,
      includeReplies: false,
      time: "week",
      author: "author-filter",
      community: "community-filter",
      site: "site-filter",
      url: "url-filter",
      selftext: "body-filter",
      self: "yes",
    },
    visibilityApplied: true,
    blocklistApplied: true,
  },
  candidates: [
    {
      id: "a",
      title: "Global deletion",
      snippet: "Removes the post for everyone.",
    },
    { id: "b", title: "Local hiding", snippet: "Hide on this device only." },
  ],
});
const answer = (choice: string) => ({
  choice,
  confidence: 0.98,
  probabilities: Object.fromEntries(
    ["direct", "related", "unrelated", "uncertain"].map((grade) => [
      grade,
      grade === choice ? 0.97 : 0.01,
    ]),
  ),
});
const response = (...choices: string[]) => ({
  model: "jev-1.13.0",
  answers: Object.fromEntries(
    choices.map((choice, index) => [`candidate_${index}`, answer(choice)]),
  ),
});
const options = (ask: RerankClient['ask']): RerankOptions => ({
  enabled: true,
  live: true,
  model: "jev-1.13.0",
  client: { ask },
});

test("one batched request submits only query and candidate text, preserves all IDs/filter/page metadata", async () => {
  const input = shortlist();
  const before = JSON.stringify(input);
  let calls = 0;
  const result = await rerankShortlist(
    input,
    options(async ({ state, questions }) => {
      calls++;
      assert.deepEqual(Object.keys(record(state)).sort(), ["candidates", "query"]);
      assert.deepEqual(candidateKeys(record(state).candidates), [
        ["title", "snippet"],
        ["title", "snippet"],
      ]);
      assert.ok(!JSON.stringify(state).includes("author-filter"));
      assert.equal(Object.keys(questions).length, 2);
      assert.match(
        required(questions.candidate_1).instructions,
        /state\.candidates\[1\]/,
      );
      return response("unrelated", "direct");
    }),
  );
  assert.equal(calls, 1);
  assert.deepEqual(result.order, ["b", "a"]);
  assert.deepEqual(result.baselineOrder, ["a", "b"]);
  assert.equal(result.scopeSha256, fingerprint(input.scope));
  assert.deepEqual([result.page, result.limit, result.total], [2, 2, 10]);
  assert.equal(JSON.stringify(input), before);
  assert.strictEqual(
    applyCandidateOrder(input.candidates, result.order)[0],
    input.candidates[1],
  );
  assert.ok(!JSON.stringify(result).includes("Removes the post"));
});

test("non-relevance sorts, no opt-in, offline, and short pages never invoke inference", async () => {
  const ask = async () => {
    throw new Error("must not call");
  };
  for (const sort of ["new", "old", "top", "replies"]) {
    const input = { ...shortlist(), sort };
    const result = await rerankShortlist(input, options(ask));
    assert.equal(result.reason, "explicit_sort_preserved");
    assert.deepEqual(result.order, ["a", "b"]);
  }
  assert.equal(
    (await rerankShortlist(shortlist(), { ...options(ask), enabled: false }))
      .reason,
    "not_enabled",
  );
  assert.equal(
    (await rerankShortlist(shortlist(), { ...options(ask), live: false }))
      .reason,
    "live_disabled",
  );
  assert.equal(
    (await rerankShortlist({ ...shortlist(), candidates: [] }, options(ask)))
      .reason,
    "shortlist_too_small",
  );
});

test("any failure, exhausted budget, malformed or ambiguous answer preserves the entire original order", async () => {
  const malformed = response("unrelated", "direct");
  required(malformed.answers.candidate_0).probabilities.direct = 5;
  const nearTie = response("unrelated", "direct");
  required(nearTie.answers.candidate_0).probabilities = {
    direct: 0.48,
    unrelated: 0.49,
    related: 0.02,
    uncertain: 0.01,
  };
  const cases = [
    response("uncertain", "direct"),
    { model: "wrong", answers: {} },
    response("direct"),
    {
      ...response("direct", "related"),
      answers: { unknown_id: answer("direct"), candidate_1: answer("related") },
    },
    malformed,
    nearTie,
  ];
  for (const value of cases) {
    const result = await rerankShortlist(
      shortlist(),
      options(async () => value),
    );
    assert.deepEqual(result.order, ["a", "b"]);
    assert.equal(result.applied, false);
  }
  for (const error of [
    new JevError("request_budget_exceeded"),
    new Error("PRIVATE PROVIDER BODY"),
  ]) {
    const result = await rerankShortlist(
      shortlist(),
      options(async () => {
        throw error;
      }),
    );
    assert.deepEqual(result.order, ["a", "b"]);
    assert.equal(result.applied, false);
    assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  }
});

test("ties preserve original order and applying an invalid permutation cannot add/drop/duplicate candidates", async () => {
  const input = shortlist();
  const result = await rerankShortlist(
    input,
    options(async () => response("direct", "direct")),
  );
  assert.deepEqual(result.order, ["a", "b"]);
  for (const ids of [["a"], ["a", "a"], ["a", "new"], ["a", "b", "new"]])
    assert.throws(
      () => applyCandidateOrder(input.candidates, ids),
      /exactly once/,
    );
  const many = Array.from({ length: 20 }, (_, index) => ({
    id: `id-${index}`,
  }));
  assert.deepEqual(
    applyCandidateOrder(many, many.map((row) => row.id).reverse()),
    [...many].reverse(),
  );
});

test("malformed scopes, duplicate IDs, excessive candidates and embedded label fields fail before inference", () => {
  for (const mutate of [
    (input: ReturnType<typeof shortlist>) => {
      input.scope.blocklistApplied = false;
    },
    (input: ReturnType<typeof shortlist>) => {
      Reflect.deleteProperty(input.scope.filters, "nsfw");
    },
    (input: ReturnType<typeof shortlist>) => {
      input.scope.filters.time = "unknown";
    },
    (input: ReturnType<typeof shortlist>) => {
      input.scope.page = 0;
    },
    (input: ReturnType<typeof shortlist>) => {
      input.scope.limit = 1;
    },
    (input: ReturnType<typeof shortlist>) => {
      input.retrieval = "cid-lookup";
    },
    (input: ReturnType<typeof shortlist>) => {
      required(input.candidates[1]).id = "a";
    },
    (input: ReturnType<typeof shortlist>) => {
      Reflect.set(required(input.candidates[1]), "grade", 2);
    },
    (input: ReturnType<typeof shortlist>) => {
      required(input.candidates[1]).snippet = "a".repeat(2001);
    },
    (input: ReturnType<typeof shortlist>) => {
      input.candidates = Array.from({ length: 21 }, (_, index) => ({
        id: `${index}`,
        title: "Title",
        snippet: "Snippet",
      }));
      input.scope.limit = 25;
      input.scope.total = 25;
    },
  ]) {
    const input = shortlist();
    mutate(input);
    assert.throws(() => validateShortlist(input));
  }
});

test("NDCG uses graded discounted gains and MRR counts only direct matches; all-zero labels stay explicit", () => {
  const labels = [
    { id: "partial", grade: 1 },
    { id: "direct", grade: 2 },
    { id: "no", grade: 0 },
  ];
  const baseline = rankingMetrics(["partial", "direct", "no"], labels);
  assert.equal(baseline.reciprocalRank, 0.5);
  assert.ok(
    Math.abs(required(baseline.ndcg) - (1 + 3 / Math.log2(3)) / (3 + 1 / Math.log2(3))) <
      1e-12,
  );
  assert.equal(rankingMetrics(["direct", "partial", "no"], labels).ndcg, 1);
  assert.equal(
    rankingMetrics(["partial", "direct", "no"], labels, 1).reciprocalRank,
    0,
  );
  assert.deepEqual(rankingMetrics(["x"], [{ id: "x", grade: 0 }]), {
    cutoff: 1,
    ndcg: null,
    reciprocalRank: 0,
    directRelevantCandidates: 0,
  });
  for (const wrong of [
    [{ id: "partial", grade: 1 }],
    [
      { id: "partial", grade: 1 },
      { id: "direct", grade: 3 },
      { id: "no", grade: 0 },
    ],
    [
      { id: "partial", grade: 1 },
      { id: "partial", grade: 2 },
      { id: "no", grade: 0 },
    ],
  ])
    assert.throws(() => rankingMetrics(["partial", "direct", "no"], wrong));
});

test("evaluation separates offline baseline from live returned order, with labels withheld and fallbacks included", async () => {
  const corpus = {
    version: 1,
    provenance: "synthetic",
    cases: [
      {
        id: "fixture",
        shortlist: shortlist(),
        labels: [
          { id: "a", grade: 0 },
          { id: "b", grade: 2 },
        ],
      },
    ],
  };
  const offline = await evaluateReranking(corpus);
  assert.equal(offline.summary.returnedNdcg, null);
  assert.equal(offline.summary.baselineMrr, 0.5);
  const client = {
    ask: async (payload: JevRequest) => {
      assert.ok(!JSON.stringify(payload).includes("grade"));
      assert.ok(!JSON.stringify(payload).includes("labels"));
      return response("unrelated", "direct");
    },
  };
  const live = await evaluateReranking(corpus, {
    live: true,
    client,
    model: "jev-1.13.0",
  });
  assert.equal(live.summary.returnedNdcg, 1);
  assert.equal(live.summary.returnedMrr, 1);
  const fallback = await evaluateReranking(corpus, {
    live: true,
    client: {
      ask: async () => {
        throw new Error();
      },
    },
    model: "jev-1.13.0",
  });
  assert.equal(fallback.summary.fallbacks, 1);
  assert.equal(fallback.summary.returnedMrr, 0.5);
  assert.throws(
    () =>
      validateRerankCorpus({ ...corpus, provenance: "independently-reviewed" }),
    /reviewer/,
  );
});

test("CLI --live without --rerank keeps offline original order even with an invalid private config", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "jev-rerank-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "shortlist.json");
  await fs.writeFile(file, JSON.stringify(shortlist()));
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
      fileURLToPath(new URL("../rerank.mts", import.meta.url)),
      "--input",
      file,
      "--live",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, JEV_CONFIG_FILE: "/absent-configuration-fixture" },
    },
  );
  assert.equal(result.status, 2);
  assert.equal(result.stderr, "");
  assert.equal(record(JSON.parse(result.stdout)).reason, "not_enabled");
  await fs.writeFile(file, "a".repeat(512 * 1024 + 1));
  await assert.rejects(() => readRerankJson(file), /512 KiB/);
});

test("shipped fixtures are valid synthetic corpora and do not claim measured retrieval performance", async () => {
  const corpus = validateRerankCorpus(
    JSON.parse(
      await fs.readFile(
        new URL("../fixtures/rerank.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  assert.equal(corpus.provenance, "synthetic");
  assert.match(String(record(corpus).description), /not independently human-reviewed/);
  assert.equal(corpus.cases.length, 3);
});

test("a file that grows after stat remains bounded and is rejected", async () => {
  const originalOpen = fs.open;
  let closed = false;
  Reflect.set(fs, "open", async () => ({
    stat: async () => ({ isFile: () => true, size: 2 }),
    // Model a file changed to >512 KiB between stat and its first read.
    read: async (buffer: Buffer, offset: number, length: number) => {
      buffer.fill(32, offset, offset + length);
      return { bytesRead: length };
    },
    close: async () => {
      closed = true;
    },
  }));
  try {
    await assert.rejects(() => readRerankJson("growth-fixture"), /grew beyond/);
  } finally {
    fs.open = originalOpen;
  }
  assert.equal(closed, true);
});

type ScoredAnswers = Record<`candidate_${number}`, ScoreAnswer> & Record<`evidence_${number}`, NoulAnswer>;
function scoredResponse(
  questions: Questions,
  probabilities: [number, number, number][] = [
    [0.8, 0.2, 0],
    [0, 0.2, 0.8],
  ],
) {
  const answers: ScoredAnswers = {};
  probabilities.forEach((values, index) => {
    const question = required(questions[`candidate_${index}`]);
    assert.ok(question.type === 'score');
    answers[`candidate_${index}`] = {
      score: values[1] + 2 * values[2],
      confidence: 0.2,
      probabilities: Object.fromEntries(values.map((value, level) => [level, value])),
      legend: Object.fromEntries(question.criteria.map((value, level) => [level, value])),
    };
    answers[`evidence_${index}`] = { noul: 0.99 };
  });
  return { model: "jev-1.13.0", answers };
}

test("Score separates graded relevance uncertainty from evidence sufficiency and retains scope", async () => {
  let calls = 0;
  const input = shortlist();
  const before = JSON.stringify(input);
  const report = await rerankShortlist(input, {
    ...options(async ({ state, questions }) => {
      calls++;
      assert.deepEqual(Object.keys(questions), [
        "candidate_0",
        "evidence_0",
        "candidate_1",
        "evidence_1",
      ]);
      assert.equal(required(questions.candidate_0).type, "score");
      assert.equal(required(questions.evidence_0).type, "noul");
      assert.deepEqual(Object.keys(record(state)), ["query", "candidates"]);
      assert.ok(!JSON.stringify(state).includes("author-filter"));
      return scoredResponse(questions);
    }),
    primitive: "score",
  });
  assert.equal(calls, 1);
  assert.equal(report.primitive, "score");
  assert.equal(report.applied, true);
  assert.deepEqual(report.order, ["b", "a"]);
  assert.equal(required(required(report.judgments)[0]).confidence, 0.2);
  assert.equal(required(required(report.judgments)[0]).evidenceProbability, 0.99);
  assert.equal(JSON.stringify(input), before);
  assert.equal(report.scopeSha256, fingerprint(input.scope));
});

test("Score/Noul malformed data and missing evidence preserve whole original page", async () => {
  for (const mutate of [
    (data: ReturnType<typeof scoredResponse>) => {
      required(data.answers.evidence_0).noul = 0.89;
    },
    (data: ReturnType<typeof scoredResponse>) => {
      delete data.answers.evidence_0;
    },
    (data: ReturnType<typeof scoredResponse>) => {
      Reflect.set(required(data.answers.evidence_0), "noul", "0.99");
    },
    (data: ReturnType<typeof scoredResponse>) => {
      required(data.answers.evidence_0).noul = NaN;
    },
    (data: ReturnType<typeof scoredResponse>) => {
      required(data.answers.candidate_0).score = 20;
    },
    (data: ReturnType<typeof scoredResponse>) => {
      required(data.answers.candidate_0).score = 0.8;
    },
    (data: ReturnType<typeof scoredResponse>) => {
      required(data.answers.candidate_0).confidence = -1;
    },
    (data: ReturnType<typeof scoredResponse>) => {
      required(data.answers.candidate_0).probabilities["extra"] = 0;
    },
    (data: ReturnType<typeof scoredResponse>) => {
      required(data.answers.candidate_0).probabilities["0"] = 0;
    },
    (data: ReturnType<typeof scoredResponse>) => {
      required(data.answers.candidate_0).legend["0"] = "PRIVATE PROVIDER BODY";
    },
  ]) {
    const report = await rerankShortlist(shortlist(), {
      ...options(async ({ questions }) => {
        const data = scoredResponse(questions);
        mutate(data);
        return data;
      }),
      primitive: "score",
    });
    assert.equal(report.applied, false);
    assert.deepEqual(report.order, ["a", "b"]);
    assert.ok(!JSON.stringify(report).includes("PRIVATE"));
  }
});

test("Score accepts bounded serialization slack, preserves ties, and never calls for oversized pages", async () => {
  const report = await rerankShortlist(shortlist(), {
    ...options(async ({ questions }) => {
      const data = scoredResponse(questions, [
        [0.005, 0.995, 0],
        [0.005, 0.995, 0],
      ]);
      for (const id of ["candidate_0", "candidate_1"])
        Reflect.set(required(Reflect.get(data.answers, id)), "score", 1);
      return data;
    }),
    primitive: "score",
  });
  assert.equal(report.applied, true);
  assert.deepEqual(report.order, ["a", "b"]);
  const input = shortlist();
  input.candidates = Array.from({ length: 11 }, (_, index) => ({
    id: `${index}`,
    title: "Title",
    snippet: "Text",
  }));
  input.scope.limit = 11;
  input.scope.total = 11;
  let calls = 0;
  const large = await rerankShortlist(input, {
    ...options(async () => {
      calls++;
      throw new Error("Unexpected inference request");
    }),
    primitive: "score",
  });
  assert.equal(large.reason, "score_shortlist_too_large");
  assert.equal(calls, 0);
  await assert.rejects(
    () => rerankShortlist(shortlist(), { primitive: "unknown" }),
    /Primitive/,
  );
});

test("Score accepts the observed separately rounded values without changing returned judgments", async () => {
  const report = await rerankShortlist(shortlist(), {
    ...options(async ({ questions }) => {
      const data = scoredResponse(questions, [
        [0.79, 0.21, 0],
        [0.79, 0.21, 0],
      ]);
      required(data.answers.candidate_0).score = 0.22;
      return data;
    }),
    primitive: "score",
  });
  assert.equal(report.applied, true);
  assert.deepEqual(report.order, ["a", "b"]);
  assert.equal(required(required(report.judgments)[0]).score, 0.22);
  assert.equal(required(required(required(report.judgments)[0]).probabilities)["1"], 0.21);
});

test("paired comparison alternates variants, withholds labels and includes failed runs in metrics", async () => {
  const corpus = {
    version: 1,
    provenance: "synthetic",
    cases: ["first", "second"].map((id) => ({
      id,
      shortlist: shortlist(),
      labels: [
        { id: "a", grade: 0 },
        { id: "b", grade: 2 },
      ],
    })),
  };
  const modes: string[] = [];
  const result = await compareReranking(corpus, {
    live: true,
    model: "jev-1.13.0",
    client: {
      ask: async ({ questions, state }) => {
        const mode = required(questions.candidate_0).type;
        modes.push(mode);
        assert.ok(!JSON.stringify(state).includes("labels"));
        if (mode === "choice") throw new JevError("provider_timeout");
        return scoredResponse(questions);
      },
    },
  });
  assert.deepEqual(modes, ["choice", "score", "score", "choice"]);
  assert.equal(required(result.summary.variants.choice).fallbacks, 2);
  assert.equal(required(result.summary.variants.choice).returnedMrr, 0.5);
  assert.equal(required(result.summary.variants.score).applied, 2);
  assert.equal(required(result.summary.variants.score).returnedMrr, 1);
  const offline = await compareReranking(corpus);
  assert.equal(required(offline.summary.variants.score).returnedMrr, null);
  assert.equal(required(offline.summary.variants.choice).medianElapsedMs, null);
});

test("comparison rejects an insufficient request budget before reading private settings", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
      fileURLToPath(new URL("../rerank-eval.mts", import.meta.url)),
      "--compare",
      "--live",
      "--max-requests",
      "5",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, JEV_CONFIG_FILE: "/absent-configuration-fixture" },
    },
  );
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /could not run/);
});

test("default and explicit baseline retain the pre-trial prompt hashes and fallback rules", async () => {
  const hashes = {
    choice: "2fe60334d6e92b3966e8265d7accfcc1860aff9088afb4b812bd62c552ae1338",
    score: "e24090a999238f0b6da6fa2560ea11cc544cc53c22e02a5303c79a464fd4546f",
  };
  for (const primitive of ["choice", "score"] as const) {
    for (const rubricOptions of [{}, { rubric: "baseline" }]) {
      const report = await rerankShortlist(shortlist(), {
        ...options(async ({ questions }) => {
          if (primitive === "choice") return response("uncertain", "direct");
          const data = scoredResponse(questions);
          required(data.answers.evidence_0).noul = 0.89;
          return data;
        }),
        primitive,
        ...rubricOptions,
      });
      assert.equal(report.rubric, "baseline");
      assert.equal(report.rubricSha256, hashes[primitive]);
      assert.equal(report.applied, false);
      assert.deepEqual(report.order, ["a", "b"]);
      assert.equal(
        report.reason,
        primitive === "choice"
          ? "ambiguous_or_invalid_answer"
          : "insufficient_evidence",
      );
    }
  }
});

test("contrastive questions fit the shared client contract and report the exact selected prompt hash", async () => {
  for (const primitive of ["choice", "score"] as const) {
    let submitted: Questions | undefined;
    const report = await rerankShortlist(shortlist(), {
      ...options(async ({ questions, state }) => {
        validateQuestions(questions);
        submitted = questions;
        assert.deepEqual(Object.keys(record(state)), ["query", "candidates"]);
        return primitive === "choice"
          ? response("unrelated", "direct")
          : scoredResponse(questions);
      }),
      primitive,
      rubric: "contrastive",
    });
    const baseline = await rerankShortlist(shortlist(), { primitive });
    assert.equal(report.rubric, "contrastive");
    assert.notEqual(report.rubricSha256, baseline.rubricSha256);
    assert.equal(
      report.rubricSha256,
      fingerprint(
        primitive === "choice" ? Object.values(required(submitted)) : submitted,
      ),
    );
    assert.match(JSON.stringify(submitted), /kitchen-specific/);
    assert.equal(report.applied, true);
    assert.deepEqual(report.order, ["b", "a"]);
    assert.deepEqual([report.page, report.limit, report.total], [2, 2, 10]);
    assert.equal(report.scopeSha256, baseline.scopeSha256);
    assert.equal(report.shortlistSha256, baseline.shortlistSha256);
  }
});

test("Score rejects a valid but wrong-rubric legend, and contrastive failures preserve the page", async () => {
  let baselineQuestions: Questions | undefined;
  await rerankShortlist(shortlist(), {
    ...options(async ({ questions }) => {
      baselineQuestions = questions;
      return scoredResponse(questions);
    }),
    primitive: "score",
  });
  for (const primitive of ["choice", "score"] as const) {
    const report = await rerankShortlist(shortlist(), {
      ...options(async () =>
        primitive === "score"
          ? scoredResponse(required(baselineQuestions))
          : response("uncertain", "direct"),
      ),
      primitive,
      rubric: "contrastive",
    });
    assert.equal(report.applied, false);
    assert.deepEqual(report.order, ["a", "b"]);
    if (primitive === "score")
      assert.equal(report.reason, "invalid_provider_answers");
    let calls = 0;
    const sorted = await rerankShortlist(
      { ...shortlist(), sort: "new" },
      {
        ...options(async () => {
          calls++;
          throw new Error("Unexpected inference request");
        }),
        primitive,
        rubric: "contrastive",
      },
    );
    assert.equal(calls, 0);
    assert.equal(sorted.reason, "explicit_sort_preserved");
  }
});

test("evaluations select either rubric on the same labeled corpus without sending labels", async () => {
  const corpus = {
    version: 1,
    provenance: "synthetic",
    cases: [
      {
        id: "comparison-fixture",
        shortlist: shortlist(),
        labels: [{ id: "a", grade: 0 }, { id: "b", grade: 2 }],
      },
    ],
  };
  const reports = [];
  for (const rubric of ["baseline", "contrastive"]) {
    const report = await evaluateReranking(corpus, {
      live: true,
      model: "jev-1.13.0",
      primitive: "score",
      rubric,
      client: {
        ask: async ({ state, questions }) => {
          assert.deepEqual(Object.keys(record(state)), ["query", "candidates"]);
          assert.ok(!JSON.stringify(state).includes("comparison-fixture"));
          return scoredResponse(questions);
        },
      },
    });
    assert.equal(report.rubric, rubric);
    assert.equal(required(report.results[0]).report.rubric, rubric);
    reports.push(report);
  }
  assert.equal(required(reports[0]).corpusSha256, required(reports[1]).corpusSha256);
  assert.notEqual(
    required(required(reports[0]).results[0]).report.rubricSha256,
    required(required(reports[1]).results[0]).report.rubricSha256,
  );
  const paired = await compareReranking(corpus, { rubric: "contrastive" });
  assert.equal(paired.rubric, "contrastive");
  for (const primitive of ["choice", "score"] as const)
    assert.equal(
      required(paired.results[0]).variants[primitive].report.rubric,
      "contrastive",
    );
});

test("invalid rubric is rejected before inference or live evaluation settings", async () => {
  let calls = 0;
  await assert.rejects(
    () => rerankShortlist(shortlist(), {
      ...options(async () => {
        calls++;
        throw new Error("Unexpected inference request");
      }),
      rubric: "other",
    }),
    /Rubric must be baseline or contrastive/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    () => evaluateMain(["--live", "--rubric", "other"]),
    /Rubric must be baseline or contrastive/,
  );
});

test("contrastive CLI dry runs retain original order without private settings", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
      fileURLToPath(new URL("../rerank-eval.mts", import.meta.url)),
      "--rubric", "contrastive", "--primitive", "score",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, JEV_CONFIG_FILE: "/absent-configuration-fixture" },
    },
  );
  assert.equal(result.status, 2);
  assert.equal(result.stderr, "");
  const report = record(JSON.parse(result.stdout));
  assert.equal(report.rubric, "contrastive");
  assert.equal(record(report.summary).returnedNdcg, null);
  assert.equal(report.usage, null);
  assert.ok(Array.isArray(report.results));
  for (const value of report.results) {
    const row = record(record(value).report);
    assert.equal(row.rubric, "contrastive");
    assert.equal(row.reason, "live_disabled");
    assert.deepEqual(row.order, row.baselineOrder);
  }
});
