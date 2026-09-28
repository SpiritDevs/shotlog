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
