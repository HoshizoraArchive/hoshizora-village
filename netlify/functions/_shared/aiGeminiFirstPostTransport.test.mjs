import assert from "node:assert/strict";
import test from "node:test";
import { runGeminiObservation } from "./aiGemini.mjs";
import { AI_ERROR } from "./aiErrors.mjs";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";

function firstPostOutput() {
  return JSON.stringify({
    media_type: "text",
    text_observation: "初めての挨拶をまっすぐ届けてくれた。",
    visual_observation: null,
    audio_observation: null,
    lyric_observation: null,
    key_moments: [],
    confidence: 0.91,
    should_post: true,
    star_letter: "はじめましての声、ちゃんと届いたよ。これからこの街で少しずつ光を見つけていこうね。",
  });
}

function baseArgs(client, timeout = 1234) {
  return {
    client,
    config: {
      model: "gemini-3.5-flash",
      observationTimeoutMs: timeout,
    },
    post: {
      id: "11111111-1111-4111-8111-111111111111",
      type: "text",
      body: "はじめまして！テスターです！よろしくお願いします！",
    },
    mediaRows: [],
    storageRequirements: [],
    supabase: {},
    observationContext: AI_OBSERVATION_CONTEXT.FIRST_POST_WELCOME,
    authorProfile: {
      display_name: "テスター",
      username: "tester",
    },
    isFirstPostWelcome: true,
  };
}

test("text first-post welcome uses Models.generateContent instead of experimental Interactions", async () => {
  const calls = [];
  let interactionCalls = 0;
  const client = {
    models: {
      generateContent(request) {
        calls.push(request);
        return Promise.resolve({
          text: firstPostOutput(),
          usageMetadata: {
            promptTokenCount: 420,
            candidatesTokenCount: 55,
            thoughtsTokenCount: 25,
            totalTokenCount: 500,
          },
        });
      },
    },
    interactions: {
      create() {
        interactionCalls += 1;
        throw new Error("experimental transport must not be used for text first-post welcome");
      },
    },
  };

  const result = await runGeminiObservation(baseArgs(client));

  assert.equal(calls.length, 1);
  assert.equal(interactionCalls, 0);
  assert.equal(calls[0].model, "gemini-3.5-flash");
  assert.equal(calls[0].contents.includes("最初の流星便"), true);
  assert.equal(calls[0].contents.includes("<author_call_name>\nテスターさん\n</author_call_name>"), true);
  assert.equal(calls[0].config.systemInstruction.length > 0, true);
  assert.equal(calls[0].config.responseMimeType, "application/json");
  assert.equal(JSON.stringify(calls[0].config.responseJsonSchema).includes("maxLength"), false);
  assert.equal(JSON.stringify(calls[0].config.responseJsonSchema).includes("minLength"), false);
  assert.equal(calls[0].config.httpOptions.timeout, 1234);
  assert.equal(calls[0].config.httpOptions.retryOptions.attempts, 1);
  assert.equal(calls[0].config.abortSignal instanceof AbortSignal, true);
  assert.equal(result.output.star_letter.includes("はじめましての声"), true);
  assert.deepEqual(
    {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
    },
    {
      inputTokens: 420,
      outputTokens: 80,
      totalTokens: 500,
    },
  );
});

test("text first-post welcome timeout does not send a second generation", async () => {
  let calls = 0;
  const client = {
    models: {
      generateContent(request) {
        calls += 1;
        assert.equal(request.config.httpOptions.retryOptions.attempts, 1);
        assert.equal(request.config.abortSignal instanceof AbortSignal, true);
        return new Promise((resolve, reject) => {
          request.config.abortSignal.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError", status: 408 }));
          });
        });
      },
    },
  };

  await assert.rejects(
    () => runGeminiObservation(baseArgs(client, 1)),
    (error) => error?.code === AI_ERROR.GEMINI_TIMEOUT[0],
  );

  assert.equal(calls, 1);
});

test("non-welcome text observation keeps the existing Interactions transport", async () => {
  let modelCalls = 0;
  let interactionCalls = 0;
  const client = {
    models: {
      generateContent() {
        modelCalls += 1;
        throw new Error("generateContent should be reserved for first-post text welcome");
      },
    },
    interactions: {
      create() {
        interactionCalls += 1;
        return Promise.resolve({
          output_text: firstPostOutput(),
          usage: {
            total_input_tokens: 420,
            total_output_tokens: 55,
            total_thought_tokens: 25,
            total_tokens: 500,
          },
        });
      },
    },
    files: {
      delete() {
        return Promise.resolve({});
      },
    },
  };
  const args = baseArgs(client);
  args.observationContext = AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST;
  args.isFirstPostWelcome = false;

  await runGeminiObservation(args);

  assert.equal(modelCalls, 0);
  assert.equal(interactionCalls, 1);
});
