#!/usr/bin/env python3
"""
Test script to verify the secure configuration works correctly.
This script can be run after installing dependencies to validate the configuration.
"""

import os
import sys
from pathlib import Path

# Add app to path
sys.path.insert(0, str(Path(__file__).parent))


def test_development_config():
    """Test that development configuration loads correctly."""
    print("🧪 Testing development configuration...")

    # Set development environment variables
    os.environ.update({
        'DATABASE_URL': 'postgresql+psycopg://dev:dev@localhost:5432/app',
        'SECRET_KEY': 'dev-secret-key-for-local-testing-only',
        'ENV': 'development',
        'DEBUG': 'true'
    })

    try:
        from app.core.config import settings
        print(f"✅ Environment: {settings.env}")
        print(f"✅ Database URL: {settings.database_url}")
        print(f"✅ Debug: {settings.debug}")
        print(f"✅ Is development: {settings.is_development}")
        print(f"✅ Logging level: {settings.logging.level}")
        return True
    except Exception as e:
        print(f"❌ Development config failed: {e}")
        return False


def test_production_validation():
    """Test that production validation works correctly."""
    print("\n🔒 Testing production validation...")

    # Set production environment variables with some bad values
    os.environ.update({
        'DATABASE_URL': 'postgresql+psycopg://dev:dev@localhost:5432/app',  # Bad: localhost
        'SECRET_KEY': 'secure-production-key-12345',
        'ENV': 'production',
        'DEBUG': 'false'
    })

    try:
        from app.core.config import Settings
        # This should fail due to localhost in production database URL
        settings = Settings()
        print("❌ Production validation failed - allowed localhost database URL")
        return False
    except ValueError as e:
        print(f"✅ Production validation works: {e}")
        return True
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False


def test_secret_key_validation():
    """Test that secret key validation works."""
    print("\n🔐 Testing secret key validation...")

    os.environ.update({
        'DATABASE_URL': 'postgresql+psycopg://dev:dev@localhost:5432/app',
        'SECRET_KEY': 'dev-secret-key-change-in-production',  # Bad: default value
        'ENV': 'development'
    })

    try:
        from app.core.config import Settings
        settings = Settings()
        print("❌ Secret key validation failed - allowed default value")
        return False
    except ValueError as e:
        print(f"✅ Secret key validation works: {e}")
        return True
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False


def main():
    """Run all configuration tests."""
    print("🚀 Starting configuration validation tests...\n")

    tests = [
        test_development_config,
        test_production_validation,
        test_secret_key_validation
    ]

    passed = 0
    total = len(tests)

    for test in tests:
        if test():
            passed += 1

    print(f"\n📊 Results: {passed}/{total} tests passed")

    if passed == total:
        print("🎉 All configuration tests passed!")
        return 0
    else:
        print("❌ Some tests failed. Check the configuration.")
        return 1


if __name__ == "__main__":
    sys.exit(main())