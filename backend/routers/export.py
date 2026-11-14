"""
Trend Detector — Export Router
SRD §18: Export and Sharing
"""

import io
import csv
from typing import Optional
from fastapi import APIRouter, Query, Response
from services.data_service import data_service
from services.analysis_service import analysis_service
from services.story_service import story_service
from core.exceptions import DataNotAvailableError, VariableNotFoundError, RegionNotFoundError

router = APIRouter(prefix="/api/export", tags=["Export"])


@router.get("/csv/{variable_id}/{region_id}")
async def export_series_csv(
    variable_id: str,
    region_id: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    use_anomalies: bool = Query(True)
):
    """
    Export the displayed time series as CSV.
    SRD §18 FR-EXP-001, FR-EXP-005.
    Includes metadata headers (dataset, variable, region, period, citation).
    """
    variable = data_service.get_variable(variable_id)
    if not variable:
        raise VariableNotFoundError(variable_id)
    region = data_service.get_region(region_id)
    if not region:
        raise RegionNotFoundError(region_id)

    ts_data = data_service.get_time_series(variable_id, region_id, start_date, end_date)
    if not ts_data:
        raise DataNotAvailableError(variable_id, region_id)

    output = io.StringIO()
    writer = csv.writer(output)

    # Write metadata comments
    writer.writerow(["# Trend Detector Time Series Export"])
    writer.writerow([f"# Variable: {variable['name']} ({variable_id})"])
    writer.writerow([f"# Region: {region['name']} ({region_id})"])
    writer.writerow([f"# Dataset: {variable['dataset']} ({variable['provider']})"])
    writer.writerow([f"# Unit: {variable['unit']}"])
    writer.writerow([f"# Citation: {variable.get('citation', '')}"])
    writer.writerow([f"# Disclaimer: A trend does not prove cause or future continuation."])
    writer.writerow([])

    # Header
    writer.writerow(["date", "raw_value", "seasonal_anomaly"])

    for pt in ts_data.get("series", []):
        writer.writerow([
            pt.get("date"),
            pt.get("value") if pt.get("value") is not None else "",
            pt.get("anomaly") if pt.get("anomaly") is not None else ""
        ])

    csv_content = output.getvalue()
    filename = f"trend_detector_{variable_id}_{region_id}.csv"

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/summary/{variable_id}/{region_id}")
async def export_summary_markdown(
    variable_id: str,
    region_id: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    use_anomalies: bool = Query(True)
):
    """
    Export text/markdown summary of the trend analysis.
    SRD §18 FR-EXP-003, FR-EXP-005.
    """
    analysis = analysis_service.analyze(
        variable_id=variable_id,
        region_id=region_id,
        start_date=start_date,
        end_date=end_date,
        use_anomalies=use_anomalies
    )
    story = story_service.generate_story(analysis)

    card = story["card"]
    ols = analysis["ols"]
    mk = analysis["mann_kendall"]
    ts = analysis["theil_sen"]
    conf = analysis["confidence_meter"]

    md = f"""# Trend Detector Investigation Report

## Investigation Summary
- **What Changed?** {card['what_changed']}
- **Where?** {card['where']}
- **How Much?** {card['how_much']}
- **Statistically Significant?** {card['significant']}

## Story Narrative
{story['narrative']}

## Why This Matters
{story['why_it_matters']}

## Statistical Evidence
- **Ordinary Least Squares (OLS) Slope:** {ols['slope_per_year']} {ols['slope_unit']}
- **OLS p-value:** {ols['p_value']}
- **95% Confidence Interval:** [{ols['ci_95_lower']}, {ols['ci_95_upper']}] {ols['slope_unit']}
- **R-squared:** {ols['r_squared']}
- **Theil-Sen Robust Slope:** {ts['slope_per_year']} {ts['slope_unit']}
- **Mann-Kendall Test:** Direction: {mk['direction']} (Z = {mk['z_statistic']}, p = {mk['p_value']}, tau = {mk['tau']})
- **Total Change:** {ols['total_change']} {analysis['unit']}
- **Observations:** {analysis['n_observations']} valid ({analysis['pct_missing']}% missing)
- **Lag-1 Autocorrelation:** {analysis['autocorrelation']['lag1']}

## Confidence Assessment
- **Overall Confidence:** {conf['overall']}
"""
    for factor, info in conf['factors'].items():
        md += f"- **{factor.replace('_', ' ').title()}:** {info['rating']} - {info['detail']}\n"

    md += f"""
## Provenance & Data Sources
- **Dataset:** {analysis['dataset']} ({analysis['dataset_version']})
- **Provider:** {analysis['provider']}
- **Data Type:** {analysis['data_type']}
- **Period Analyzed:** {analysis['period']['start']} to {analysis['period']['end']}

> **Disclaimer:** {analysis['disclaimer']}
"""
    filename = f"report_{variable_id}_{region_id}.md"
    return Response(
        content=md,
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
