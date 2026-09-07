/**
 * The single source of truth for how the bench WORDS a fixture's `load` proof — Matter's
 * retest-18: two independent chips used to claim "the plate answers from it" unconditionally
 * (`FixturePanel`'s own Fixture-tab chip, and `PlateBench`'s plate-frame banner, wired only
 * through the `jig:fixture-loaded` DOM event `FixturePanel` dispatches — see
 * `dispatchFixtureLoaded` there). Both now render through this one function so the two chips
 * can never drift into saying different things about the same fixture.
 *
 * `LoadProof` mirrors `packages/server/src/fixtures/route.ts`'s `FixtureProof` — kept as its
 * own type (not imported) the same way this package's `FullFixture`/`FixturesListResponse`
 * already do for other server response shapes: this is the JSON the bench reads back over
 * `fetch`, not the server's own internal type.
 */
export type LoadProof =
  | { ok: true; header: 'x-jig-fixture'; value: string }
  | { ok: false; reason: 'no-endpoints' | 'not-confirmed' | 'unreachable' };

/** `proof` undefined covers BOTH "no `load` has completed this session yet" (e.g. a fixture
 * already active on mount/refresh) and "the server has no plate wired to check against at all"
 * — neither is grounds to claim the plate answers from it, so both get the same neutral,
 * unembellished wording. */
export function loadedMessage(name: string, proof: LoadProof | undefined): string {
  if (!proof) return `fixture · ${name} · loaded`;
  if (proof.ok) return `fixture · ${name} · loaded — the plate answers from it — x-jig-fixture: ${proof.value}`;
  switch (proof.reason) {
    case 'no-endpoints':
      return `fixture · ${name} · loaded — the plate can't answer from it yet: this survey has no endpoints — survey the API too`;
    case 'unreachable':
      return `fixture · ${name} · loaded — couldn't reach the plate to check`;
    default:
      return `fixture · ${name} · loaded — the plate isn't confirming it (no x-jig-fixture on its response)`;
  }
}
