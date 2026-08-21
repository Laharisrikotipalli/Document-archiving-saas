from setuptools import setup, find_packages

setup(
    name="archive-cli",
    version="1.0.0",
    description="Tenant CLI for the Partnr Document Archiving SaaS",
    packages=find_packages(),
    install_requires=[
        "click>=8.1.7",
        "requests>=2.31.0",
        "tabulate>=0.9.0",
    ],
    entry_points={
        "console_scripts": [
            "archive=archive.cli:cli",
        ],
    },
    python_requires=">=3.8",
)
