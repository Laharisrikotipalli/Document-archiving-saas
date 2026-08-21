"""Thin HTTP client for talking to the Archive SaaS backend API."""

import requests

from .config import load_config


class ArchiveApiError(Exception):
    """Raised when the API returns an error response."""


class ArchiveClient:
    def __init__(self):
        config = load_config()
        self.base_url = config["api_url"]
        self.api_key = config["api_key"]

    def _headers(self):
        return {"X-API-Key": self.api_key}

    def request_upload_url(self, filename: str) -> dict:
        resp = requests.post(
            f"{self.base_url}/documents/upload-url",
            json={"filename": filename},
            headers=self._headers(),
            timeout=30,
        )
        self._raise_for_status(resp)
        return resp.json()

    def confirm_upload(self, storage_key: str, filename: str, size: int) -> dict:
        resp = requests.post(
            f"{self.base_url}/documents/confirm",
            json={"storage_key": storage_key, "filename": filename, "size": size},
            headers=self._headers(),
            timeout=30,
        )
        self._raise_for_status(resp)
        return resp.json()

    def list_documents(self) -> list:
        resp = requests.get(
            f"{self.base_url}/documents",
            headers=self._headers(),
            timeout=30,
        )
        self._raise_for_status(resp)
        return resp.json().get("documents", [])

    def get_download_url(self, document_id: str) -> str:
        resp = requests.get(
            f"{self.base_url}/documents/{document_id}/download-url",
            headers=self._headers(),
            timeout=30,
        )
        self._raise_for_status(resp)
        return resp.json()["download_url"]

    @staticmethod
    def _raise_for_status(resp: requests.Response):
        if resp.status_code >= 400:
            try:
                detail = resp.json().get("error", resp.text)
            except ValueError:
                detail = resp.text
            raise ArchiveApiError(f"[{resp.status_code}] {detail}")
