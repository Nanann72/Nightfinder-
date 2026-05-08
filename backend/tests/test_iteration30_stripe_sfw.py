"""
Iteration 30 - Stripe Restoration + SFW Compliance Tests
Tests:
1. Stripe API key is working (no AuthenticationError)
2. Stripe checkout sessions can be created
3. Stripe setup-intent for saved cards works
4. Site config returns SFW content (no 'adulte', '18+', 'NSFW')
5. Regression tests for auth, wallet, creators, feed, live
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
FAN_EMAIL = "fan@meandyou.fans"
FAN_PASSWORD = "TestFan2026!"
ADMIN_EMAIL = "admin@meandyou.fans"
ADMIN_PASSWORD = "Admin2026!"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def fan_token(api_client):
    """Get fan authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": FAN_EMAIL,
        "password": FAN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Fan authentication failed - skipping authenticated tests")


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get admin authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Admin authentication failed - skipping admin tests")


class TestStripeConfig:
    """Test Stripe configuration endpoint returns enabled status"""
    
    def test_stripe_config_returns_enabled(self, api_client):
        """GET /api/wallet/stripe-config should return enabled=true with publishable_key"""
        response = api_client.get(f"{BASE_URL}/api/wallet/stripe-config")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "publishable_key" in data, "Missing publishable_key"
        assert "enabled" in data, "Missing enabled field"
        assert data["enabled"] is True, "Stripe should be enabled"
        assert data["publishable_key"].startswith("pk_live_"), "Should be live publishable key"


class TestStripeCheckout:
    """Test Stripe checkout session creation"""
    
    def test_wallet_buy_creates_checkout_session(self, api_client, fan_token):
        """POST /api/wallet/buy should return a Stripe checkout URL"""
        response = api_client.post(
            f"{BASE_URL}/api/wallet/buy",
            json={"pack_id": "starter", "origin_url": "https://meandyou.fans"},
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "url" in data, "Missing checkout URL"
        assert "session_id" in data, "Missing session_id"
        assert data["url"].startswith("https://checkout.stripe.com/"), "URL should be Stripe checkout"
        assert data["session_id"].startswith("cs_live_"), "Session ID should be live"


class TestStripeSetupIntent:
    """Test Stripe setup intent for saved cards"""
    
    def test_setup_intent_returns_client_secret(self, api_client, fan_token):
        """POST /api/wallet/cards/setup-intent should return client_secret"""
        response = api_client.post(
            f"{BASE_URL}/api/wallet/cards/setup-intent",
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "client_secret" in data, "Missing client_secret"
        assert "publishable_key" in data, "Missing publishable_key"
        assert data["client_secret"].startswith("seti_"), "Should be setup intent secret"
        assert data["publishable_key"].startswith("pk_live_"), "Should be live publishable key"


class TestSiteConfigSFW:
    """Test site config returns SFW content"""
    
    def test_site_config_sfw_about_text(self, api_client):
        """GET /api/site-config about_text should mention 'premium' not 'adultes'"""
        response = api_client.get(f"{BASE_URL}/api/site-config")
        assert response.status_code == 200
        
        data = response.json()
        about = data.get("about_text", "").lower()
        
        # Should contain SFW terms
        assert "premium" in about, "about_text should mention 'premium'"
        
        # Should NOT contain NSFW terms
        assert "adulte" not in about, "about_text should NOT mention 'adulte'"
        assert "18+" not in about, "about_text should NOT mention '18+'"
        assert "nsfw" not in about, "about_text should NOT mention 'nsfw'"
    
    def test_site_config_sfw_footer_tagline(self, api_client):
        """GET /api/site-config footer_tagline should be SFW"""
        response = api_client.get(f"{BASE_URL}/api/site-config")
        assert response.status_code == 200
        
        data = response.json()
        tagline = data.get("footer_tagline", "").lower()
        
        # Should contain SFW terms
        assert "premium" in tagline, "footer_tagline should mention 'premium'"
        
        # Should NOT contain NSFW terms
        assert "adultes vérifiés" not in tagline, "footer_tagline should NOT mention 'adultes vérifiés'"
        assert "stripe" not in tagline, "footer_tagline should NOT mention 'Stripe'"
    
    def test_site_config_sfw_faq(self, api_client):
        """GET /api/site-config FAQ should not mention '18+' or 'adultes'"""
        response = api_client.get(f"{BASE_URL}/api/site-config")
        assert response.status_code == 200
        
        data = response.json()
        faq = data.get("faq", [])
        
        for item in faq:
            q = item.get("q", "").lower()
            a = item.get("a", "").lower()
            combined = q + " " + a
            
            assert "18+" not in combined, f"FAQ should NOT mention '18+': {item}"
            assert "adulte" not in combined, f"FAQ should NOT mention 'adulte': {item}"


class TestRegressionAuth:
    """Regression tests for authentication"""
    
    def test_login_works(self, api_client):
        """POST /api/auth/login should work"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == FAN_EMAIL
    
    def test_me_works(self, api_client, fan_token):
        """GET /api/auth/me should return user info"""
        response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == FAN_EMAIL
        assert "user_id" in data
    
    def test_logout_works(self, api_client, fan_token):
        """POST /api/auth/logout should work"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/logout",
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        assert response.status_code == 200


class TestRegressionWallet:
    """Regression tests for wallet"""
    
    def test_wallet_returns_balance(self, api_client, fan_token):
        """GET /api/wallet should return coin balance"""
        response = api_client.get(
            f"{BASE_URL}/api/wallet",
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "coin_balance" in data
        assert isinstance(data["coin_balance"], int)
    
    def test_wallet_packs_available(self, api_client):
        """GET /api/wallet/packs should return coin packs"""
        response = api_client.get(f"{BASE_URL}/api/wallet/packs")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 4, "Should have at least 4 packs (starter, popular, premium, vip)"
        
        pack_ids = [p["pack_id"] for p in data]
        assert "starter" in pack_ids
        assert "popular" in pack_ids


class TestRegressionCreators:
    """Regression tests for creators"""
    
    def test_creators_list_works(self, api_client):
        """GET /api/creators should return creators list"""
        response = api_client.get(f"{BASE_URL}/api/creators?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestRegressionFeed:
    """Regression tests for feed"""
    
    def test_feed_works(self, api_client, fan_token):
        """GET /api/feed should return feed items"""
        response = api_client.get(
            f"{BASE_URL}/api/feed?limit=5",
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestRegressionCoinPayments:
    """Regression tests for coin-based payments"""
    
    def test_subscribe_endpoint_exists(self, api_client, fan_token):
        """POST /api/payments/subscribe should exist (may fail due to no creator)"""
        response = api_client.post(
            f"{BASE_URL}/api/payments/subscribe",
            json={"creator_id": "nonexistent"},
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        # Should return 404 (creator not found) or 400 (validation), not 500
        assert response.status_code in [400, 404, 422], f"Unexpected status: {response.status_code}"
    
    def test_tip_endpoint_exists(self, api_client, fan_token):
        """POST /api/payments/tip should exist (may fail due to no creator)"""
        response = api_client.post(
            f"{BASE_URL}/api/payments/tip",
            json={"creator_id": "nonexistent", "coins": 10},
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        # Should return 404 (creator not found) or 400 (validation), not 500
        assert response.status_code in [400, 404, 422], f"Unexpected status: {response.status_code}"


class TestStripeBundleSubscription:
    """Test Stripe bundle subscription endpoint"""
    
    def test_subscribe_bundle_stripe_creates_session(self, api_client, fan_token):
        """POST /api/payments/subscribe-bundle-stripe should create checkout session"""
        # First get a real creator ID
        creators_resp = api_client.get(f"{BASE_URL}/api/creators?limit=1")
        if creators_resp.status_code != 200 or not creators_resp.json():
            pytest.skip("No creators available for bundle test")
        
        creator_id = creators_resp.json()[0]["creator_id"]
        
        response = api_client.post(
            f"{BASE_URL}/api/payments/subscribe-bundle-stripe",
            json={
                "creator_id": creator_id,
                "months": 1,
                "origin_url": "https://meandyou.fans"
            },
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        
        # May fail if already subscribed, but should not be 500
        if response.status_code == 200:
            data = response.json()
            assert "url" in data, "Missing checkout URL"
            assert data["url"].startswith("https://checkout.stripe.com/"), "Should be Stripe checkout URL"
        else:
            # 400 = already subscribed or validation error, which is acceptable
            assert response.status_code in [400, 422], f"Unexpected status: {response.status_code}: {response.text}"


class TestLiveSession:
    """Test live session endpoints"""
    
    def test_live_sessions_list(self, api_client):
        """GET /api/live/active should return list of active live sessions"""
        response = api_client.get(f"{BASE_URL}/api/live/active")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
