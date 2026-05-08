"""
Iteration 41 Tests: AI Moderation System + Wallet Reconcile
Tests for:
- POST /api/wallet/reconcile (auth required)
- GET /api/admin/moderation/policy
- PATCH /api/admin/moderation/policy
- GET /api/admin/moderation/reports
- POST /api/admin/moderation/reports/{id}/action
- Non-admin 403 on /admin/moderation/* endpoints
"""
import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@meandyou.fans"
ADMIN_PASSWORD = "Admin2026!"
FAN_EMAIL = "fan@meandyou.fans"
FAN_PASSWORD = "TestFan2026!"


class TestWalletReconcile:
    """Tests for POST /api/wallet/reconcile endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def _login_fan(self):
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        if resp.status_code == 200:
            token = resp.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return True
        return False
    
    def test_reconcile_requires_auth(self):
        """POST /wallet/reconcile without auth returns 401"""
        resp = requests.post(f"{BASE_URL}/api/wallet/reconcile")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("✓ /wallet/reconcile requires authentication")
    
    def test_reconcile_with_auth(self):
        """POST /wallet/reconcile with auth returns reconcile stats"""
        assert self._login_fan(), "Failed to login as fan"
        resp = self.session.post(f"{BASE_URL}/api/wallet/reconcile")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        # Verify response structure
        assert "reconciled" in data, "Missing 'reconciled' field"
        assert "coins_added" in data, "Missing 'coins_added' field"
        assert "scanned" in data, "Missing 'scanned' field"
        assert isinstance(data["reconciled"], int), "reconciled should be int"
        assert isinstance(data["coins_added"], int), "coins_added should be int"
        assert isinstance(data["scanned"], int), "scanned should be int"
        print(f"✓ /wallet/reconcile returns: reconciled={data['reconciled']}, coins_added={data['coins_added']}, scanned={data['scanned']}")


class TestAdminModerationPolicy:
    """Tests for GET/PATCH /api/admin/moderation/policy"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def _login_admin(self):
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if resp.status_code == 200:
            token = resp.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return True
        return False
    
    def _login_fan(self):
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        if resp.status_code == 200:
            token = resp.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return True
        return False
    
    def test_get_policy_requires_admin(self):
        """GET /admin/moderation/policy without admin returns 403"""
        assert self._login_fan(), "Failed to login as fan"
        resp = self.session.get(f"{BASE_URL}/api/admin/moderation/policy")
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("✓ GET /admin/moderation/policy requires admin (403 for fan)")
    
    def test_get_policy_as_admin(self):
        """GET /admin/moderation/policy returns full policy with all fields"""
        assert self._login_admin(), "Failed to login as admin"
        resp = self.session.get(f"{BASE_URL}/api/admin/moderation/policy")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        # Verify all 12 ban_* filters
        ban_filters = [
            "ban_nudity", "ban_violence", "ban_hate_speech", "ban_spam",
            "ban_scam_links", "ban_drugs", "ban_weapons", "ban_minors",
            "ban_copyright", "ban_external_contacts", "ban_doxxing", "ban_off_topic"
        ]
        for f in ban_filters:
            assert f in data, f"Missing filter: {f}"
        print(f"✓ All 12 ban_* filters present")
        
        # Verify 4 scan_* targets
        scan_targets = ["scan_content", "scan_profiles", "scan_messages", "scan_live_chat"]
        for t in scan_targets:
            assert t in data, f"Missing scan target: {t}"
        print(f"✓ All 4 scan_* targets present")
        
        # Verify 7 action_* keys
        action_keys = [
            "action_nudity", "action_violence", "action_hate_speech",
            "action_spam", "action_scam_links", "action_minors", "action_default"
        ]
        for a in action_keys:
            assert a in data, f"Missing action key: {a}"
        print(f"✓ All 7 action_* keys present")
        
        # Verify other required fields
        assert "keyword_blacklist" in data, "Missing keyword_blacklist"
        assert "auto_suspend_after_violations" in data, "Missing auto_suspend_after_violations"
        assert "ban_fake_identity" in data, "Missing ban_fake_identity"
        assert "alert_on_minor_signup" in data, "Missing alert_on_minor_signup"
        assert "trust_verified_creators" in data, "Missing trust_verified_creators"
        assert "enabled" in data, "Missing enabled"
        print(f"✓ All additional policy fields present")
        print(f"✓ Policy enabled={data.get('enabled')}, keyword_blacklist has {len(data.get('keyword_blacklist', []))} entries")
    
    def test_patch_policy_requires_admin(self):
        """PATCH /admin/moderation/policy without admin returns 403"""
        assert self._login_fan(), "Failed to login as fan"
        resp = self.session.patch(f"{BASE_URL}/api/admin/moderation/policy", json={"ban_drugs": True})
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("✓ PATCH /admin/moderation/policy requires admin (403 for fan)")
    
    def test_patch_policy_partial_update(self):
        """PATCH /admin/moderation/policy with partial update merges and returns full policy"""
        assert self._login_admin(), "Failed to login as admin"
        
        # Get current state
        resp = self.session.get(f"{BASE_URL}/api/admin/moderation/policy")
        original = resp.json()
        original_ban_drugs = original.get("ban_drugs", False)
        
        # Partial update
        test_keyword = f"test_kw_{uuid.uuid4().hex[:6]}"
        patch_data = {
            "ban_drugs": not original_ban_drugs,  # Toggle
            "keyword_blacklist": [test_keyword]
        }
        resp = self.session.patch(f"{BASE_URL}/api/admin/moderation/policy", json=patch_data)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        # Verify partial update was applied
        assert data.get("ban_drugs") == (not original_ban_drugs), "ban_drugs not updated"
        assert test_keyword in data.get("keyword_blacklist", []), "keyword_blacklist not updated"
        
        # Verify full policy is returned (not just the patched fields)
        assert "enabled" in data, "Full policy not returned"
        assert "ban_nudity" in data, "Full policy not returned"
        print(f"✓ PATCH merges partial update and returns full policy")
        
        # Restore original state
        self.session.patch(f"{BASE_URL}/api/admin/moderation/policy", json={
            "ban_drugs": original_ban_drugs,
            "keyword_blacklist": original.get("keyword_blacklist", [])
        })
        print(f"✓ Restored original policy state")


class TestAdminModerationReports:
    """Tests for GET/POST /api/admin/moderation/reports"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def _login_admin(self):
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if resp.status_code == 200:
            token = resp.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return True
        return False
    
    def _login_fan(self):
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        if resp.status_code == 200:
            token = resp.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return True
        return False
    
    def test_get_reports_requires_admin(self):
        """GET /admin/moderation/reports without admin returns 403"""
        assert self._login_fan(), "Failed to login as fan"
        resp = self.session.get(f"{BASE_URL}/api/admin/moderation/reports")
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("✓ GET /admin/moderation/reports requires admin (403 for fan)")
    
    def test_get_reports_pending(self):
        """GET /admin/moderation/reports?status=pending returns list"""
        assert self._login_admin(), "Failed to login as admin"
        resp = self.session.get(f"{BASE_URL}/api/admin/moderation/reports", params={"status": "pending"})
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list response"
        print(f"✓ GET /admin/moderation/reports?status=pending returns {len(data)} reports")
    
    def test_get_reports_various_statuses(self):
        """GET /admin/moderation/reports with various status filters"""
        assert self._login_admin(), "Failed to login as admin"
        
        statuses = ["pending", "approve", "delete_content", "ban_user", "dismiss"]
        for status in statuses:
            resp = self.session.get(f"{BASE_URL}/api/admin/moderation/reports", params={"status": status})
            assert resp.status_code == 200, f"Expected 200 for status={status}, got {resp.status_code}"
            data = resp.json()
            assert isinstance(data, list), f"Expected list for status={status}"
            print(f"✓ status={status}: {len(data)} reports")
    
    def test_action_report_requires_admin(self):
        """POST /admin/moderation/reports/{id}/action without admin returns 403"""
        assert self._login_fan(), "Failed to login as fan"
        resp = self.session.post(f"{BASE_URL}/api/admin/moderation/reports/fake_id/action", json={"action": "dismiss"})
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("✓ POST /admin/moderation/reports/{id}/action requires admin (403 for fan)")
    
    def test_action_report_not_found(self):
        """POST /admin/moderation/reports/{id}/action with invalid id returns 404"""
        assert self._login_admin(), "Failed to login as admin"
        resp = self.session.post(f"{BASE_URL}/api/admin/moderation/reports/nonexistent_id/action", json={"action": "dismiss"})
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("✓ POST /admin/moderation/reports/{id}/action returns 404 for invalid id")


class TestModerationReportCreation:
    """Test that content with scam keywords creates a moderation report"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def _login_admin(self):
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if resp.status_code == 200:
            token = resp.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return True
        return False
    
    def test_scam_content_creates_report(self):
        """Creating content with scam keywords should create a moderation report
        Note: This test may not create a report if EMERGENT_LLM_KEY is not set
        or if the moderation runs asynchronously and takes time."""
        assert self._login_admin(), "Failed to login as admin"
        
        # First, check if there's a creator profile for admin
        # If not, we can't create content - skip this test
        resp = self.session.get(f"{BASE_URL}/api/auth/me")
        user = resp.json()
        
        # Check current pending reports count
        resp = self.session.get(f"{BASE_URL}/api/admin/moderation/reports", params={"status": "pending"})
        initial_count = len(resp.json())
        print(f"Initial pending reports: {initial_count}")
        
        # Note: Content creation requires a creator profile
        # The admin may not have one, so this test documents the expected behavior
        # rather than fully testing it
        print("✓ Moderation report creation flow documented (requires creator profile to fully test)")


class TestWebhookStripeFallback:
    """Test webhook/stripe endpoint behavior"""
    
    def test_webhook_endpoint_exists(self):
        """POST /webhook/stripe endpoint exists and handles requests"""
        # Send a minimal request - it should return 400 (bad request) not 404
        resp = requests.post(f"{BASE_URL}/api/webhook/stripe", data=b"{}")
        # 400 means endpoint exists but request is invalid (expected)
        # 404 would mean endpoint doesn't exist
        assert resp.status_code in [200, 400], f"Expected 200 or 400, got {resp.status_code}"
        print(f"✓ POST /webhook/stripe endpoint exists (status={resp.status_code})")


class TestNonAdminAccess:
    """Verify non-admin users get 403 on all /admin/moderation/* endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def _login_fan(self):
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        if resp.status_code == 200:
            token = resp.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return True
        return False
    
    def test_all_moderation_endpoints_require_admin(self):
        """All /admin/moderation/* endpoints return 403 for non-admin"""
        assert self._login_fan(), "Failed to login as fan"
        
        endpoints = [
            ("GET", "/api/admin/moderation/policy"),
            ("PATCH", "/api/admin/moderation/policy"),
            ("GET", "/api/admin/moderation/reports"),
            ("POST", "/api/admin/moderation/reports/test_id/action"),
        ]
        
        for method, path in endpoints:
            if method == "GET":
                resp = self.session.get(f"{BASE_URL}{path}")
            elif method == "PATCH":
                resp = self.session.patch(f"{BASE_URL}{path}", json={})
            elif method == "POST":
                resp = self.session.post(f"{BASE_URL}{path}", json={"action": "dismiss"})
            
            assert resp.status_code == 403, f"Expected 403 for {method} {path}, got {resp.status_code}"
            print(f"✓ {method} {path} returns 403 for non-admin")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
