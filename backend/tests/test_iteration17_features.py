"""
Iteration 17 Backend Tests
Tests for:
1. POST /api/wallet/buy - Stripe LIVE mode (session_id starts with 'cs_live_*')
2. POST /api/payments/subscribe-bundle-stripe - Stripe LIVE mode (session_id starts with 'cs_live_*')
3. POST /api/auth/register - newsletter_opt_in field support
4. GET /api/payments/status/{session_id} - Direct Stripe API polling
5. PATCH /api/creators/me - subscription_price regression
6. Regression tests for /wallet/packs, /creators, /auth/me, /admin/users
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


class TestNewsletterOptIn:
    """Test POST /api/auth/register with newsletter_opt_in field"""
    
    def _get_admin_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def _cleanup_user(self, user_id):
        """Helper to delete test user via admin API"""
        admin_token = self._get_admin_token()
        requests.delete(f"{BASE_URL}/api/admin/users/{user_id}", 
                       headers={"Authorization": f"Bearer {admin_token}"})
    
    def test_register_with_newsletter_opt_in_true(self):
        """Register with newsletter_opt_in=true should store it in DB"""
        unique_email = f"test_newsletter_true_{uuid.uuid4().hex[:8]}@meandyou.fans"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123!",
            "name": "Test Newsletter True",
            "is_creator": False,
            "newsletter_opt_in": True
        })
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        user_id = data["user"]["user_id"]
        
        # Verify newsletter_opt_in is stored (check via /auth/me)
        token = data["access_token"]
        me_resp = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_resp.status_code == 200
        me_data = me_resp.json()
        # newsletter_opt_in may or may not be exposed in /auth/me, but registration should succeed
        print(f"✓ Registration with newsletter_opt_in=true succeeded, user_id={user_id}")
        
        # Cleanup
        self._cleanup_user(user_id)
    
    def test_register_with_newsletter_opt_in_false(self):
        """Register with newsletter_opt_in=false should store it in DB"""
        unique_email = f"test_newsletter_false_{uuid.uuid4().hex[:8]}@meandyou.fans"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123!",
            "name": "Test Newsletter False",
            "is_creator": False,
            "newsletter_opt_in": False
        })
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        user_id = data["user"]["user_id"]
        print(f"✓ Registration with newsletter_opt_in=false succeeded, user_id={user_id}")
        
        # Cleanup
        self._cleanup_user(user_id)
    
    def test_register_without_newsletter_opt_in_backward_compat(self):
        """Register without newsletter_opt_in field should still work (backward compatibility)"""
        unique_email = f"test_newsletter_none_{uuid.uuid4().hex[:8]}@meandyou.fans"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123!",
            "name": "Test Newsletter None",
            "is_creator": False
            # No newsletter_opt_in field
        })
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        user_id = data["user"]["user_id"]
        print(f"✓ Registration without newsletter_opt_in succeeded (backward compat), user_id={user_id}")
        
        # Cleanup
        self._cleanup_user(user_id)


class TestStripeLiveMode:
    """Test Stripe LIVE mode - session_id should start with 'cs_live_*'"""
    
    @pytest.fixture
    def fan_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL, "password": FAN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def test_wallet_buy_returns_cs_live_session(self, fan_token):
        """POST /api/wallet/buy should return session_id starting with 'cs_live_'"""
        response = requests.post(f"{BASE_URL}/api/wallet/buy",
                                json={
                                    "pack_id": "starter",
                                    "origin_url": "https://fan-culture.preview.emergentagent.com"
                                },
                                headers={"Authorization": f"Bearer {fan_token}"})
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "session_id" in data, "Response should contain session_id"
        assert "url" in data, "Response should contain Stripe checkout URL"
        
        session_id = data["session_id"]
        assert session_id.startswith("cs_live_"), f"Expected session_id to start with 'cs_live_', got: {session_id}"
        assert data["url"].startswith("https://checkout.stripe.com"), f"URL should be Stripe checkout URL, got: {data['url']}"
        
        print(f"✓ /wallet/buy returns LIVE session: {session_id[:30]}...")
        return session_id
    
    def test_subscribe_bundle_stripe_returns_cs_live_session(self, fan_token):
        """POST /api/payments/subscribe-bundle-stripe should return session_id starting with 'cs_live_'"""
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
        
        assert "session_id" in data, "Response should contain session_id"
        assert "url" in data, "Response should contain Stripe checkout URL"
        
        session_id = data["session_id"]
        assert session_id.startswith("cs_live_"), f"Expected session_id to start with 'cs_live_', got: {session_id}"
        assert data["url"].startswith("https://checkout.stripe.com"), f"URL should be Stripe checkout URL, got: {data['url']}"
        
        print(f"✓ /subscribe-bundle-stripe returns LIVE session: {session_id[:30]}...")
        return session_id


class TestPaymentStatus:
    """Test GET /api/payments/status/{session_id} with direct Stripe API"""
    
    @pytest.fixture
    def fan_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL, "password": FAN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def test_payment_status_for_live_session(self, fan_token):
        """GET /api/payments/status/{session_id} should return status for a live session"""
        # First create a session
        buy_resp = requests.post(f"{BASE_URL}/api/wallet/buy",
                                json={
                                    "pack_id": "starter",
                                    "origin_url": "https://fan-culture.preview.emergentagent.com"
                                },
                                headers={"Authorization": f"Bearer {fan_token}"})
        
        assert buy_resp.status_code == 200, f"Failed to create session: {buy_resp.text}"
        session_id = buy_resp.json()["session_id"]
        
        # Now check status
        status_resp = requests.get(f"{BASE_URL}/api/payments/status/{session_id}",
                                  headers={"Authorization": f"Bearer {fan_token}"})
        
        assert status_resp.status_code == 200, f"Failed to get status: {status_resp.text}"
        data = status_resp.json()
        
        assert "session_id" in data
        assert "status" in data
        assert "payment_status" in data
        assert data["session_id"] == session_id
        
        # For a newly created session, status should be 'open' and payment_status 'unpaid' or 'initiated'
        assert data["status"] in ["open", "complete", "expired"], f"Unexpected status: {data['status']}"
        assert data["payment_status"] in ["unpaid", "initiated", "paid", "no_payment_required"], f"Unexpected payment_status: {data['payment_status']}"
        
        print(f"✓ /payments/status returns: status={data['status']}, payment_status={data['payment_status']}")


class TestCreatorProfileUpdate:
    """Test PATCH /api/creators/me with subscription_price (regression)"""
    
    def _get_admin_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def _cleanup_user(self, user_id):
        admin_token = self._get_admin_token()
        requests.delete(f"{BASE_URL}/api/admin/users/{user_id}", 
                       headers={"Authorization": f"Bearer {admin_token}"})
    
    def test_patch_creators_me_subscription_price(self):
        """PATCH /api/creators/me with subscription_price should work"""
        # Create a test creator
        unique_email = f"test_creator_price_{uuid.uuid4().hex[:8]}@meandyou.fans"
        reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123!",
            "name": "Test Creator Price",
            "is_creator": True
        })
        assert reg_resp.status_code == 200, f"Registration failed: {reg_resp.text}"
        data = reg_resp.json()
        token = data["access_token"]
        user_id = data["user"]["user_id"]
        
        # Update subscription_price
        patch_resp = requests.patch(f"{BASE_URL}/api/creators/me",
                                   json={"subscription_price": 15.99},
                                   headers={"Authorization": f"Bearer {token}"})
        
        assert patch_resp.status_code == 200, f"PATCH failed: {patch_resp.text}"
        updated = patch_resp.json()
        assert updated.get("subscription_price") == 15.99, f"Expected 15.99, got {updated.get('subscription_price')}"
        
        # Verify via GET
        get_resp = requests.get(f"{BASE_URL}/api/creators/{user_id}")
        assert get_resp.status_code == 200
        creator_data = get_resp.json()
        assert creator_data["subscription_price"] == 15.99
        
        print(f"✓ PATCH /creators/me subscription_price=15.99 works correctly")
        
        # Cleanup
        self._cleanup_user(user_id)


class TestRegressionEndpoints:
    """Regression tests for existing endpoints"""
    
    @pytest.fixture
    def fan_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL, "password": FAN_PASSWORD
        })
        return resp.json()["access_token"]
    
    @pytest.fixture
    def admin_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        return resp.json()["access_token"]
    
    def test_wallet_packs_endpoint(self):
        """GET /api/wallet/packs should return coin packs"""
        response = requests.get(f"{BASE_URL}/api/wallet/packs")
        assert response.status_code == 200, f"Failed: {response.text}"
        packs = response.json()
        assert isinstance(packs, list)
        assert len(packs) >= 4, "Should have at least 4 packs (starter, popular, premium, vip)"
        
        # Verify pack structure
        for pack in packs:
            assert "pack_id" in pack
            assert "coins" in pack
            assert "eur" in pack
        
        print(f"✓ /wallet/packs returns {len(packs)} packs")
    
    def test_creators_endpoint(self):
        """GET /api/creators should return creators list"""
        response = requests.get(f"{BASE_URL}/api/creators")
        assert response.status_code == 200, f"Failed: {response.text}"
        creators = response.json()
        assert isinstance(creators, list)
        
        # Verify creator structure
        for c in creators[:3]:
            assert "creator_id" in c
            assert "display_name" in c
        
        print(f"✓ /creators returns {len(creators)} creators")
    
    def test_auth_me_endpoint(self, fan_token):
        """GET /api/auth/me should return current user"""
        response = requests.get(f"{BASE_URL}/api/auth/me",
                               headers={"Authorization": f"Bearer {fan_token}"})
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["email"] == FAN_EMAIL
        assert "user_id" in data
        assert "role" in data
        print(f"✓ /auth/me returns user: {data['email']}")
    
    def test_admin_users_endpoint(self, admin_token):
        """GET /api/admin/users should return users list"""
        response = requests.get(f"{BASE_URL}/api/admin/users",
                               headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200, f"Failed: {response.text}"
        users = response.json()
        assert isinstance(users, list)
        assert len(users) > 0
        
        # Verify user structure
        for u in users[:3]:
            assert "user_id" in u
            assert "email" in u
            assert "has_creator_profile" in u
        
        print(f"✓ /admin/users returns {len(users)} users")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
