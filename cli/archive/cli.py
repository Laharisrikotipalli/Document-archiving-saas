"""Tenant-facing command-line interface for the Archive SaaS.

Commands:
    archive configure --api-url <url> --api-key <key>
    archive upload <filepath>
    archive list
    archive download <document_id> --output-path <path>
"""

import os
import sys

import click
import requests
from tabulate import tabulate

from .api import ArchiveApiError, ArchiveClient
from .config import save_config


@click.group()
def cli():
    """Archive CLI - manage documents in the Partnr document archiving SaaS."""
    pass


@cli.command()
@click.option("--api-url", required=True, help="Base URL of the Archive API, e.g. http://localhost:3000")
@click.option("--api-key", required=True, help="Your tenant API key")
def configure(api_url, api_key):
    """Save the API URL and API key locally for future commands."""
    save_config(api_url, api_key)
    click.echo(f"Configuration saved to ~/.archive/config.json")


@cli.command()
@click.argument("filepath", type=click.Path(exists=True, dir_okay=False))
def upload(filepath):
    """Upload a document to the archive."""
    try:
        client = ArchiveClient()
        filename = os.path.basename(filepath)
        file_size = os.path.getsize(filepath)

        # 1. Request a pre-signed upload URL
        url_resp = client.request_upload_url(filename)
        upload_url = url_resp["upload_url"]
        storage_key = url_resp["storage_key"]

        # 2. PUT the file directly to storage
        with open(filepath, "rb") as f:
            put_resp = requests.put(upload_url, data=f, timeout=120)
        if put_resp.status_code >= 300:
            click.echo(f"Error: upload to storage failed ({put_resp.status_code})", err=True)
            sys.exit(1)

        # 3. Confirm the upload with the API to register metadata
        document = client.confirm_upload(storage_key, filename, file_size)

        click.echo(f"Upload successful. Document ID: {document['id']}")
    except (ArchiveApiError, FileNotFoundError) as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


@cli.command(name="list")
def list_documents():
    """List all documents belonging to the configured tenant."""
    try:
        client = ArchiveClient()
        documents = client.list_documents()

        if not documents:
            click.echo("No documents found.")
            return

        rows = [
            [doc["id"], doc["filename"], doc["size"], doc["created_at"]]
            for doc in documents
        ]
        click.echo(tabulate(rows, headers=["ID", "Filename", "Size", "Created At"]))
    except (ArchiveApiError, FileNotFoundError) as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


@cli.command()
@click.argument("document_id")
@click.option("--output-path", required=True, type=click.Path(), help="Where to save the downloaded file")
def download(document_id, output_path):
    """Download a specific document by ID."""
    try:
        client = ArchiveClient()
        download_url = client.get_download_url(document_id)

        resp = requests.get(download_url, stream=True, timeout=120)
        if resp.status_code >= 300:
            click.echo(f"Error: download from storage failed ({resp.status_code})", err=True)
            sys.exit(1)

        with open(output_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)

        click.echo(f"Downloaded document {document_id} to {output_path}")
    except (ArchiveApiError, FileNotFoundError) as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    cli()
