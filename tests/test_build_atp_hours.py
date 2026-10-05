"""20261004b: normalize_oh in tools/build-atp-hours.py (stdlib only, no network). Run: python3 tests/test_build_atp_hours.py"""
import importlib.util, json, os, unittest

ROOT = os.path.join(os.path.dirname(__file__), "..")
spec = importlib.util.spec_from_file_location("atp", os.path.join(ROOT, "tools", "build-atp-hours.py"))
atp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(atp)
N = atp.normalize_oh


class NormalizeOh(unittest.TestCase):
    def test_overnight_split_folds_into_one_span(self):
        # Lebanon VA Taco Bell shape from ATP: the 00:00-02:00 piece is the previous night's close.
        self.assertEqual(N("Mo-Su 00:00-02:00,09:00-23:00,09:00-24:00"), "Mo-Su 09:00-02:00")

    def test_overlapping_spans_merge(self):
        self.assertEqual(N("Mo-Fr 08:00-12:00,11:00-17:00; Sa 09:00-13:00"), "Mo-Fr 08:00-17:00; Sa 09:00-13:00")

    def test_clean_values_are_untouched(self):
        for s in ["Mo-Fr 08:00-17:00", "Mo-Th 10:00-22:00; Fr-Sa 10:00-23:00", "Mo-Su 00:00-24:00", "24/7", ""]:
            self.assertEqual(N(s), s)

    def test_unreadable_values_are_returned_unchanged(self):
        for s in ["Sa[4] 09:00-11:00", "Mo-Fr 09:00-17:00; PH off", "sunrise-sunset", "Mo-Fr 09:00+"]:
            self.assertEqual(N(s), s)

    def test_later_rule_still_replaces_earlier_days(self):
        # OSM semantics: the second rule redefines Sa; nothing is merged across rules.
        self.assertEqual(N("Mo-Sa 09:00-17:00; Sa 10:00-14:00"), "Mo-Sa 09:00-17:00; Sa 10:00-14:00")

    def test_idempotent_on_committed_data(self):
        with open(os.path.join(ROOT, "data", "atp-hours.json"), encoding="utf-8") as f:
            data = json.load(f)
        seen = 0
        for r in data["rows"]:  # [brand:wikidata, lat, lng, opening_hours, spider]
            oh = r[3]
            if isinstance(oh, str):
                seen += 1
                self.assertEqual(N(oh), oh, oh)
        self.assertGreater(seen, 1000)


if __name__ == "__main__":
    unittest.main(verbosity=1)
