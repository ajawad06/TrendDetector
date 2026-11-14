"""
Trend Detector — Statistical Engine Unit Tests
SRD §16 FR-STAT-010: System shall include unit tests comparing outputs
against a reference implementation.
"""

import unittest
import numpy as np
from core.statistics import (
    compute_ols,
    compute_mann_kendall,
    compute_theil_sen,
    compute_autocorrelation,
    compute_anomalies,
    determine_significance,
    run_full_analysis
)


class TestTrendDetectorStatistics(unittest.TestCase):

    def setUp(self):
        # Known synthetic data with positive trend + seasonal cycle
        self.times = np.array([2000.0, 2001.0, 2002.0, 2003.0, 2004.0, 2005.0])
        self.values = np.array([10.0, 12.0, 14.0, 16.0, 18.0, 20.0]) # Perfect slope = +2.0

    def test_ols_linear_regression(self):
        ols = compute_ols(self.times, self.values, unit="mm/month", pct_change_ok=True, period_years=5.0)
        self.assertAlmostEqual(ols["slope_per_year"], 2.0, places=2)
        self.assertLess(ols["p_value"], 0.001)
        self.assertAlmostEqual(ols["total_change"], 10.0, places=2)
        self.assertAlmostEqual(ols["r_squared"], 1.0, places=2)

    def test_mann_kendall_monotonic_increase(self):
        mk = compute_mann_kendall(self.values)
        self.assertEqual(mk["direction"], "increasing")
        self.assertGreater(mk["z_statistic"], 0)
        self.assertLess(mk["p_value"], 0.05)
        self.assertAlmostEqual(mk["tau"], 1.0, places=2)

    def test_mann_kendall_no_trend(self):
        flat_values = np.array([15.0, 14.9, 15.1, 15.0, 14.8, 15.2, 15.0])
        mk = compute_mann_kendall(flat_values)
        self.assertEqual(mk["direction"], "no_trend")
        self.assertGreaterEqual(mk["p_value"], 0.05)

    def test_theil_sen_robustness(self):
        # Series with one massive outlier
        outlier_values = np.array([10.0, 12.0, 99.0, 16.0, 18.0, 20.0])
        ts = compute_theil_sen(self.times, outlier_values, unit="mm/month")
        # Median pairwise slope should still be close to 2.0 despite outlier
        self.assertAlmostEqual(ts["slope_per_year"], 2.0, delta=0.5)

    def test_seasonal_anomalies(self):
        dates = ["2020-01", "2020-02", "2021-01", "2021-02"]
        values = [10.0, 20.0, 14.0, 22.0]
        # Jan mean = 12.0, Feb mean = 21.0
        anomalies, bs, be = compute_anomalies(dates, values)
        self.assertEqual(bs, "2020-01")
        self.assertEqual(be, "2021-02")
        self.assertAlmostEqual(anomalies[0], -2.0, places=2)
        self.assertAlmostEqual(anomalies[1], -1.0, places=2)
        self.assertAlmostEqual(anomalies[2], 2.0, places=2)
        self.assertAlmostEqual(anomalies[3], 1.0, places=2)

    def test_autocorrelation_warning(self):
        # Strongly autoregressive series
        times = np.arange(2000, 2025, 1/12)
        ar_values = np.zeros(len(times))
        ar_values[0] = 5.0
        for i in range(1, len(times)):
            ar_values[i] = 0.85 * ar_values[i-1] + np.random.normal(0, 0.5)

        ac = compute_autocorrelation(times, ar_values)
        self.assertTrue(ac["warning"])
        self.assertGreater(ac["lag1"], 0.3)
        self.assertIn("caution", ac["message"].lower())

    def test_insufficient_data_rejection(self):
        # SRD §16.3: Fewer than 120 monthly observations = exploratory only
        sig = determine_significance(
            ols_p=0.01,
            mk_direction="increasing",
            mk_p=0.01,
            n_observations=45, # < 120
            lag1_autocorr=0.1
        )
        self.assertTrue(sig["exploratory_only"])
        self.assertEqual(sig["verdict"], "insufficient_data")


if __name__ == "__main__":
    unittest.main()
