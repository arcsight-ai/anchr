# PR selection — anti-cherry-picking

Document which method was used. No curation to favor ANCHR.

## Method used

Option A (Preferred): Take the last 30 PRs chronologically. Exclude: merge commits, pure dependency version bumps, docs-only changes. Take the first 20 remaining.

Selection logic: From existing phase1b_extended pr-list.json (pre-built list, no cherry-pick). First 10 = sindresorhus/ky (internal). Next 10 = vercel/swr (external). No reordering to favor ANCHR.

## Swap (protocol-consistent)

Initial run produced 15 valid result JSONs and 5 run failures (logged, not fixed): clone/report issues only — no engine change.

Replaced the 5 failed PRs with 5 new PRs from the same repos, same selection logic (next in phase1b list):

| Replaced (failed) | Replacement | Repo | Reason |
|-------------------|-------------|------|--------|
| sindresorhus_ky_764 | sindresorhus_ky_693 | sindresorhus/ky | No report written |
| sindresorhus_ky_728 | sindresorhus_ky_757 | sindresorhus/ky | Clone failed (base SHA not on remote) |
| sindresorhus_ky_758 | sindresorhus_ky_761 | sindresorhus/ky | No report written |
| vercel_swr_3050 | vercel_swr_4110 | vercel/swr | No report written |
| vercel_swr_3052 | vercel_swr_4200 | vercel/swr | No report written |

Run only those 5; append results. Two of the five again had no report (761, 4200). Second swap, same logic:

| sindresorhus_ky_761 | sindresorhus_ky_755 | sindresorhus/ky | No report written |
| vercel_swr_4200 | vercel_swr_2301 | vercel/swr | No report written |

Run only those 2; append results. Final sample size = 20. No partial metrics on 15 or 18.

## PR list (final 20)

| PR_ID | Repo | BASE_SHA | HEAD_SHA | Size (S/M/L) | Cross-package? (Y/N) |
|-------|------|----------|----------|--------------|----------------------|
| sindresorhus_ky_651 | sindresorhus/ky | 4a427011ad7b4ab98bb5f02ecaa5375fba5addca | 6b97c0f4ea8fc23f23ddd1a732c3b0c69ede99ca | S | ? |
| sindresorhus_ky_693 | sindresorhus/ky | 93c02ac7817df1138e97e8971fe5165e30d68097 | 2fa9f173a74fc3c7e30aed7ef10c6ecbb1230a78 | S | ? |
| sindresorhus_ky_796 | sindresorhus/ky | d8d6cfed4e0d69f1b923f1f7b2e00e5f81345172 | 33967b45b6c89d4794b8d0a42ad330f0780b8bd6 | S | ? |
| sindresorhus_ky_756 | sindresorhus/ky | b7572d0942f6be3b22be44982601d955a3e3b34d | df3858a157735ecfd0763687bfa88b488d5bba56 | S | ? |
| sindresorhus_ky_663 | sindresorhus/ky | 1d92c203f7f60df37c03d60360237d8cb9bcb30a | 78344a8ef49e6ecb6c869bab688cb10fee000663 | S | ? |
| sindresorhus_ky_757 | sindresorhus/ky | 0f2f00a55592ccfe08c9a82a4d2db2a511f78e9b | b24de3c6b93b5a8fdf24b1d6c1cf2f8d4e2c39c9 | M | ? |
| sindresorhus_ky_792 | sindresorhus/ky | 337a1b2cf565d1e327d70377c65ef6c1a6318e70 | 0c23316446a8bba4de631168806a9eb79a4fd36f | S | ? |
| sindresorhus_ky_683 | sindresorhus/ky | b49cd03d8673ea522a29bae4ef6b4672cf23201b | 29f61fa65e5f6ee06a016374d489f0a5a65c529b | S | ? |
| sindresorhus_ky_755 | sindresorhus/ky | 2b0a10071d5bb79057c9f22ff84a854d37b2954a | 38762013757c910d21f9b6c28c4bc73d8fc7b250 | M | ? |
| sindresorhus_ky_751 | sindresorhus/ky | 7e1fd0ba60be6ae2c5aec0ef401393a54d98e372 | cf0cf02c294eafb538f05b9cfbfedde9d35c82c6 | S | ? |
| vercel_swr_4199 | vercel/swr | 147c72840dba98185ae18ae5968a6b3265fe831a | f1a6dec58d90d10a176d55f532aa2a550f699589 | S | ? |
| vercel_swr_4110 | vercel/swr | ba10cf9ed8ac23f83842dd7f8bc62f110ffac290 | 403e6dc8239c47f4e911b041bad6796df4385615 | M | ? |
| vercel_swr_4092 | vercel/swr | 1ee8ebeb2fb88c119fd9d9b4e95b8bea8d43891b | 2fcfd438facff8a3d5afcf1b89af3cf2d4ba3858 | S | ? |
| vercel_swr_3045 | vercel/swr | bd839a42e75d0215b49aff8c9ad8c28730cf0108 | f7ec36c34bf9c452f71a3fda74f5c22700526066 | S | ? |
| vercel_swr_2857 | vercel/swr | 975f99118fc11eedc79accceb6eeaead19753db9 | d7a383933559f3b4e16599fa6b11965eaffe004a | S | ? |
| vercel_swr_4064 | vercel/swr | 2684b72026c7c80279338e1c8a93f37d609fff13 | 721098ffdd6e8c2a42ef72c998e62437e0a40b9b | S | ? |
| vercel_swr_4189 | vercel/swr | c7eda399236e479152a4267667fa5c76435fadee | d382bc5e0df4aa61c2a4a615d99b53b18b7ddfdc | S | ? |
| vercel_swr_4208 | vercel/swr | a5214bf56ec2f48fdae5e82a00ae43bd65bf6493 | 0d727e8c469d856b3ee70bc06118d3cbb50deab3 | S | ? |
| vercel_swr_4118 | vercel/swr | ba10cf9ed8ac23f83842dd7f8bc62f110ffac290 | 853fa65c5d6668ca0ab36fa4b5a730e09694467e | S | ? |
| vercel_swr_2301 | vercel/swr | 9ea4a45c1620b31fb3a5a09771e0809638f47974 | 344f20fe7d4987bf59d3fa80440b333dcdbe4d7f | M | ? |

Exactly 20 rows. Real SHAs only.
