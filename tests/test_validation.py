#!/usr/bin/env python3
"""
test_validation.py — Tests that build_data.py fails loudly on invalid datasets
"""

import subprocess
import os
import tempfile
import sys

def test_failure_cases():
    print("--> Testing build_data.py failure modes...")
    
    # 1. Non-existent file
    res = subprocess.run([sys.executable, "scripts/build_data.py", "non_existent.csv"], capture_output=True, text=True)
    assert res.returncode != 0, "Must fail on missing file"
    print("✓ Missing file rejected")

    # 2. Corrupted header
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".csv") as tf:
        tf.write("month,pm25,aod,city\n")
        temp_path = tf.name
        
    try:
        res = subprocess.run([sys.executable, "scripts/build_data.py", temp_path], capture_output=True, text=True)
        assert res.returncode != 0, "Must fail on wrong header"
        print("✓ Corrupted header rejected")
    finally:
        os.remove(temp_path)

    # 3. Null / NaN value
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".csv") as tf:
        tf.write("month,pm25,aod,rain_mm,no2,city,lat,lon\n")
        tf.write("2005-01-01,NaN,0.3,50.0,1e15,Lahore,31.52,74.36\n")
        temp_path = tf.name
        
    try:
        res = subprocess.run([sys.executable, "scripts/build_data.py", temp_path], capture_output=True, text=True)
        assert res.returncode != 0, "Must fail on NaN"
        print("✓ NaN value rejected")
    finally:
        os.remove(temp_path)

    print("\n[SUCCESS] All validation failure tests passed!")

if __name__ == "__main__":
    test_failure_cases()
