import type {
  ShotlogError,
  ShotlogLabels,
  ShotlogProviderProps,
} from "shotlog";
import { expectTypeOf, test } from "vitest";

test("provider labels have finite keys and onError receives ShotlogError", () => {
  expectTypeOf<ShotlogProviderProps["labels"]>().toEqualTypeOf<
    Partial<ShotlogLabels> | undefined
  >();
  expectTypeOf<string>().not.toExtend<keyof ShotlogLabels>();
  const props: ShotlogProviderProps = {
    endpoint: "/api/support",
    labels: { submit: "Envoyer", sent: (shortId) => `Envoyé · ${shortId}` },
    onError(error) {
      expectTypeOf(error).toEqualTypeOf<ShotlogError>();
    },
  };
  expectTypeOf(props.labels?.submit).toEqualTypeOf<string | undefined>();
  // @ts-expect-error Misspelled labels must be rejected rather than accepted by an index signature.
  const invalid: Partial<ShotlogLabels> = { sumbit: "Send" };
  void invalid;
});

test("delivery is exactly one of endpoint or onSubmit", () => {
  const relay: ShotlogProviderProps = { endpoint: "/api/support" };
  const custom: ShotlogProviderProps = {
    onSubmit: async ({ log }) => void log,
  };
  void relay;
  void custom;
  // @ts-expect-error A provider needs somewhere to deliver.
  const neither: ShotlogProviderProps = {};
  // @ts-expect-error Both would be ambiguous.
  const both: ShotlogProviderProps = {
    endpoint: "/x",
    onSubmit: async () => {},
  };
  void neither;
  void both;
});

test("position accepts the seven anchors and nothing else", () => {
  expectTypeOf<NonNullable<ShotlogProviderProps["position"]>>().toEqualTypeOf<
    | "top-left"
    | "top-center"
    | "top-right"
    | "center"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right"
  >();
  const centred: ShotlogProviderProps = { endpoint: "/x", position: "center" };
  const bad: ShotlogProviderProps = {
    endpoint: "/x",
    // @ts-expect-error Positions are edge-first; "middle" is not one of them.
    position: "middle",
  };
  void centred;
  void bad;
});

test("launcher accepts a boolean or icon/text options", () => {
  const icon: ShotlogProviderProps = { endpoint: "/x" };
  const text: ShotlogProviderProps = {
    endpoint: "/x",
    launcher: { content: "icon-text", icon: null },
  };
  const bad: ShotlogProviderProps = {
    endpoint: "/x",
    // @ts-expect-error Unknown launcher content.
    launcher: { content: "big" },
  };
  void icon;
  void text;
  void bad;
});

test("recording is a custom onSubmit option; a Relay Endpoint decides for itself", () => {
  const custom: ShotlogProviderProps = {
    onSubmit: async ({ recording }) => {
      expectTypeOf(recording?.video).toEqualTypeOf<Blob | undefined>();
    },
    recording: { maxSeconds: 60 },
  };
  void custom;
  // @ts-expect-error The Relay Endpoint's recording setting applies instead.
  const relay: ShotlogProviderProps = { endpoint: "/x", recording: true };
  void relay;
});
