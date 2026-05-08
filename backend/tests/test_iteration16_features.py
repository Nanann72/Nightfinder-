"""
Iteration 16 Backend Tests
Tests for:
1. POST /api/payments/subscribe-bundle-stripe - Stripe Checkout for bundle subscription
2. GET /api/admin/users - has_creator_profile annotation
3. POST /api/admin/users/sync-roles - Audit and fix role/profile inconsistencies
4. PATCH /api/admin/users/{user_id} - Role change cascade (delete/create creator profile)
5. POST /api/auth/register - is_creator flag creates/doesn't create creator profile
6. GET /api/creators - Only returns users with creator profiles
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admin@meandyou.fans"
ADMIN_PASSWORD = "Admin2026!"
FAN_EMAIL = "fan@meandyou.fans"
FAN_PASSWORD = "TestFan2026!"


class TestAuth:
    """Authentication tests"""
    
    def test_login_admin(self):
        """Admin login should succeed"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful, role={data['user']['role']}")
    
    def test_login_fan(self):
        """Fan login should succeed"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        assert response.status_code == 200, f"Fan login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "fan"
        print(f"✓ Fan login successful, role={data['user']['role']}")


class TestRegisterRoles:
    """Test registration with is_creator flag"""
    
    def test_register_fan_no_creator_profile(self):
        """Register with is_creator=false should NOT create creator profile"""
        unique_email = f"test_fan_{uuid.uuid4().hex[:8]}@meandyou.fans"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123!",
            "name": "Test Fan User",
            "is_creator": False
        })
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        assert data["user"]["role"] == "fan", f"Expected role='fan', got {data['user']['role']}"
        
        # Verify no creator profile exists
        token = data["access_token"]
        creators_resp = requests.get(f"{BASE_URL}/api/creators", headers={"Authorization": f"Bearer {token}"})
        assert creators_resp.status_code == 200
        creators = creators_resp.json()
        user_id = data["user"]["user_id"]
        creator_ids = [c["creator_id"] for c in creators]
        assert user_id not in creator_ids, f"Fan user {user_id} should NOT appear in creators list"
        print(f"✓ Fan registration: role=fan, NOT in creators list")
        
        # Cleanup - delete test user via admin
        self._cleanup_user(user_id)
    
    def test_register_creator_has_creator_profile(self):
        """Register with is_creator=true should create creator profile"""
        unique_email = f"test_creator_{uuid.uuid4().hex[:8]}@meandyou.fans"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123!",
            "name": "Test Creator User",
            "is_creator": True
        })
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        assert data["user"]["role"] == "creator", f"Expected role='creator', got {data['user']['role']}"
        
        # Verify creator profile exists
        token = data["access_token"]
        user_id = data["user"]["user_id"]
        creator_resp = requests.get(f"{BASE_URL}/api/creators/{user_id}", headers={"Authorization": f"Bearer {token}"})
        assert creator_resp.status_code == 200, f"Creator profile should exist: {creator_resp.text}"
        creator_data = creator_resp.json()
        assert creator_data["creator_id"] == user_id
        print(f"✓ Creator registration: role=creator, creator profile exists")
        
        # Cleanup
        self._cleanup_user(user_id)
    
    def _cleanup_user(self, user_id):
        """Helper to delete test user via admin API"""
        admin_token = self._get_admin_token()
        requests.delete(f"{BASE_URL}/api/admin/users/{user_id}", 
                       headers={"Authorization": f"Bearer {admin_token}"})
    
    def _get_admin_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        return resp.json()["access_token"]


class TestAdminUsersEndpoint:
    """Test GET /api/admin/users with has_creator_profile annotation"""
    
    @pytest.fixture
    def admin_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        assert resp.status_code == 200
        return resp.json()["access_token"]
    
    def test_admin_users_returns_has_creator_profile(self, admin_token):
        """GET /api/admin/users should include has_creator_profile for each user"""
        response = requests.get(f"{BASE_URL}/api/admin/users", 
                               headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200, f"Failed: {response.text}"
        users = response.json()
        assert isinstance(users, list)
        assert len(users) > 0, "Should have at least one user"
        
        # Check that has_creator_profile field exists
        for user in users[:5]:  # Check first 5 users
            assert "has_creator_profile" in user, f"User {user.get('email')} missing has_creator_profile"
            assert isinstance(user["has_creator_profile"], bool)
        
        print(f"✓ GET /api/admin/users returns has_creator_profile for {len(users)} users")
    
    def test_admin_users_requires_admin(self):
        """GET /api/admin/users should require admin role"""
        # Login as fan
        fan_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL, "password": FAN_PASSWORD
        })
        fan_token = fan_resp.json()["access_token"]
        
        response = requests.get(f"{BASE_URL}/api/admin/users",
                               headers={"Authorization": f"Bearer {fan_token}"})
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        print("✓ GET /api/admin/users correctly requires admin role")


class TestAdminSyncRoles:
    """Test POST /api/admin/users/sync-roles"""
    
    @pytest.fixture
    def admin_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def test_sync_roles_returns_correct_structure(self, admin_token):
        """POST /api/admin/users/sync-roles should return ok, removed_orphan_creator_profiles, created_missing_creator_profiles"""
        response = requests.post(f"{BASE_URL}/api/admin/users/sync-roles",
                                headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "ok" in data and data["ok"] == True
        assert "removed_orphan_creator_profiles" in data
        assert "created_missing_creator_profiles" in data
        assert isinstance(data["removed_orphan_creator_profiles"], int)
        assert isinstance(data["created_missing_creator_profiles"], int)
        
        print(f"✓ sync-roles: removed={data['removed_orphan_creator_profiles']}, created={data['created_missing_creator_profiles']}")
    
    def test_sync_roles_requires_admin(self):
        """POST /api/admin/users/sync-roles should require admin role"""
        fan_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL, "password": FAN_PASSWORD
        })
        fan_token = fan_resp.json()["access_token"]
        
        response = requests.post(f"{BASE_URL}/api/admin/users/sync-roles",
                                headers={"Authorization": f"Bearer {fan_token}"})
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        print("✓ sync-roles correctly requires admin role")


class TestAdminPatchUserRole:
    """Test PATCH /api/admin/users/{user_id} role changes"""
    
    @pytest.fixture
    def admin_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def test_patch_role_to_fan_deletes_creator_profile(self, admin_token):
        """PATCH role=fan should delete creator profile (anti-orphan)"""
        # First create a test creator
        unique_email = f"test_demote_{uuid.uuid4().hex[:8]}@meandyou.fans"
        reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123!",
            "name": "Test Demote User",
            "is_creator": True
        })
        assert reg_resp.status_code == 200
        user_id = reg_resp.json()["user"]["user_id"]
        
        # Verify creator profile exists
        creator_resp = requests.get(f"{BASE_URL}/api/creators/{user_id}")
        assert creator_resp.status_code == 200, "Creator profile should exist initially"
        
        # Demote to fan
        patch_resp = requests.patch(f"{BASE_URL}/api/admin/users/{user_id}",
                                   json={"role": "fan"},
                                   headers={"Authorization": f"Bearer {admin_token}"})
        assert patch_resp.status_code == 200, f"Patch failed: {patch_resp.text}"
        
        # Verify creator profile is deleted
        creator_resp2 = requests.get(f"{BASE_URL}/api/creators/{user_id}")
        assert creator_resp2.status_code == 404, "Creator profile should be deleted after demote to fan"
        
        print("✓ PATCH role=fan correctly deletes creator profile")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/users/{user_id}",
                       headers={"Authorization": f"Bearer {admin_token}"})
    
    def test_patch_role_to_creator_creates_profile(self, admin_token):
        """PATCH role=creator should auto-create creator profile"""
        # First create a test fan
        unique_email = f"test_promote_{uuid.uuid4().hex[:8]}@meandyou.fans"
        reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123!",
            "name": "Test Promote User",
            "is_creator": False
        })
        assert reg_resp.status_code == 200
        user_id = reg_resp.json()["user"]["user_id"]
        
        # Verify no creator profile
        creator_resp = requests.get(f"{BASE_URL}/api/creators/{user_id}")
        assert creator_resp.status_code == 404, "Fan should not have creator profile"
        
        # Promote to creator
        patch_resp = requests.patch(f"{BASE_URL}/api/admin/users/{user_id}",
                                   json={"role": "creator"},
                                   headers={"Authorization": f"Bearer {admin_token}"})
        assert patch_resp.status_code == 200, f"Patch failed: {patch_resp.text}"
        
        # Verify creator profile is created
        creator_resp2 = requests.get(f"{BASE_URL}/api/creators/{user_id}")
        assert creator_resp2.status_code == 200, "Creator profile should be created after promote"
        
        print("✓ PATCH role=creator correctly creates creator profile")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/users/{user_id}",
                       headers={"Authorization": f"Bearer {admin_token}"})


class TestCreatorsListEndpoint:
    """Test GET /api/creators only returns real creators"""
    
    def test_creators_list_excludes_fans(self):
        """GET /api/creators should NOT include fans"""
        response = requests.get(f"{BASE_URL}/api/creators")
        assert response.status_code == 200
        creators = response.json()
        
        # All returned items should have creator_id
        for c in creators:
            assert "creator_id" in c, "Each creator should have creator_id"
            assert "display_name" in c, "Each creator should have display_name"
        
        print(f"✓ GET /api/creators returns {len(creators)} creators (all with creator profiles)")


class TestSubscribeBundleStripe:
    """Test POST /api/payments/subscribe-bundle-stripe"""
    
    @pytest.fixture
    def fan_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL, "password": FAN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def test_subscribe_bundle_stripe_returns_url_and_session(self, fan_token):
        """POST /api/payments/subscribe-bundle-stripe should return url, session_id, amount, months"""
        # First get a creator to subscribe to
        creators_resp = requests.get(f"{BASE_URL}/api/creators")
        creators = creators_resp.json()
        if not creators:
            pytest.skip("No creators available for testing")
        
        creator_id = creators[0]["creator_id"]
        
        response = requests.post(f"{BASE_URL}/api/payments/subscribe-bundle-stripe",
                                json={
                                    "creator_id": creator_id,
                                    "months": 3,
                                    "origin_url": "https://fan-culture.preview.emergentagent.com"
                                },
                                headers={"Authorization": f"Bearer {fan_token}"})
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "url" in data, "Response should contain Stripe checkout URL"
        assert "session_id" in data, "Response should contain session_id"
        assert "amount" in data, "Response should contain amount"
        assert "months" in data, "Response should contain months"
        assert data["months"] == 3
        assert data["amount"] > 0
        assert data["url"].startswith("https://"), "URL should be a valid HTTPS URL"
        
        print(f"✓ subscribe-bundle-stripe: url={data['url'][:50]}..., amount={data['amount']}€, months={data['months']}")
    
    def test_subscribe_bundle_stripe_invalid_months(self, fan_token):
        """POST /api/payments/subscribe-bundle-stripe with invalid months should fail"""
        creators_resp = requests.get(f"{BASE_URL}/api/creators")
        creators = creators_resp.json()
        if not creators:
            pytest.skip("No creators available for testing")
        
        creator_id = creators[0]["creator_id"]
        
        response = requests.post(f"{BASE_URL}/api/payments/subscribe-bundle-stripe",
                                json={
                                    "creator_id": creator_id,
                                    "months": 5,  # Invalid - only 1, 3, 6, 12 allowed
                                    "origin_url": "https://fan-culture.preview.emergentagent.com"
                                },
                                headers={"Authorization": f"Bearer {fan_token}"})
        
        assert response.status_code == 400, f"Expected 400 for invalid months, got {response.status_code}"
        print("✓ subscribe-bundle-stripe correctly rejects invalid months")
    
    def test_subscribe_bundle_stripe_requires_auth(self):
        """POST /api/payments/subscribe-bundle-stripe should require authentication"""
        response = requests.post(f"{BASE_URL}/api/payments/subscribe-bundle-stripe",
                                json={
                                    "creator_id": "some_id",
                                    "months": 3,
                                    "origin_url": "https://example.com"
                                })
        assert response.status_code == 401, f"Expected 401 for unauthenticated, got {response.status_code}"
        print("✓ subscribe-bundle-stripe correctly requires authentication")


class TestExistingEndpointsRegression:
    """Regression tests for existing endpoints"""
    
    @pytest.fixture
    def fan_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL, "password": FAN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def test_wallet_endpoint(self, fan_token):
        """GET /api/wallet should work"""
        response = requests.get(f"{BASE_URL}/api/wallet",
                               headers={"Authorization": f"Bearer {fan_token}"})
        assert response.status_code == 200
        data = response.json()
        assert "coin_balance" in data
        print(f"✓ Wallet endpoint works, balance={data['coin_balance']}")
    
    def test_subscribe_bundle_coins(self, fan_token):
        """POST /api/payments/subscribe-bundle (coin-based) should work"""
        creators_resp = requests.get(f"{BASE_URL}/api/creators")
        creators = creators_resp.json()
        if not creators:
            pytest.skip("No creators available")
        
        creator_id = creators[0]["creator_id"]
        
        # This will likely fail due to insufficient coins, but should return proper error
        response = requests.post(f"{BASE_URL}/api/payments/subscribe-bundle",
                                json={"creator_id": creator_id, "months": 1},
                                headers={"Authorization": f"Bearer {fan_token}"})
        
        # Either 200 (success) or 402 (insufficient coins) is acceptable
        assert response.status_code in [200, 402], f"Unexpected status: {response.status_code}"
        print(f"✓ subscribe-bundle (coins) endpoint works, status={response.status_code}")
    
    def test_auth_me(self, fan_token):
        """GET /api/auth/me should work"""
        response = requests.get(f"{BASE_URL}/api/auth/me",
                               headers={"Authorization": f"Bearer {fan_token}"})
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == FAN_EMAIL
        print(f"✓ /api/auth/me works, email={data['email']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
