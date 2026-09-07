# Empty repo fixture

Deliberately has no `package.json` and no stylesheet anywhere — proves `webAdapter.detect()`
returns `false` on a repo the generic web adapter has nothing to say about, rather than matching
on the mere presence of a directory.
