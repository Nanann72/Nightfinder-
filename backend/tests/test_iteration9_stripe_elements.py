"""
Iteration 9 - Stripe Elements Integration Tests
Tests for:
1. New Stripe Elements endpoints (setup-intent, cards list/confirm/delete/default)
2. Regression tests for existing coin pack checkout, auth, admin, bank/IBAN
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
FAN_EMAIL = "fan@meandyou.fans"
FAN_PASSWORD = "TestFan2026!"
ADMIN_EMAIL = "admin@meandyou.fans"
ADMIN_PASSWORD = "Admin2026!"
CREATOR_EMAIL = "lysepress@meandyou.fans"
CREATOR_PASSWORD = "Creator2026!"
TEST_IBAN = "FR1420041010050500013M02606"


class TestAuth:
    """Authentication tests - regression"""
    
    def test_login_fan_success(self):
        """REGRESSION: Fan login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        assert response.status_code == 200, f"Fan login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["email"] == FAN_EMAIL
        print(f"✓ Fan login successful, user_id: {data['user']['user_id']}")
    
    def test_login_admin_success(self):
        """REGRESSION: Admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful")
    
    def test_login_creator_success(self):
        """REGRESSION: Creator login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CREATOR_EMAIL,
            "password": CREATOR_PASSWORD
        })
        assert response.status_code == 200, f"Creator login failed: {response.text}"
        data = response.json()
        assert data["user"]["role"] == "creator"
        print(f"✓ Creator login successful")
    
    def test_register_new_user(self):
        """REGRESSION: Registration with new email works"""
        import uuid
        unique_email = f"test_{uuid.uuid4().hex[:8]}@meandyou.fans"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass2026!",
            "name": "Test User",
            "birthdate": "1990-01-01"
        })
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == unique_email
        print(f"✓ Registration successful for {unique_email}")


class TestStripeConfig:
    """GET /api/wallet/stripe-config tests"""
    
    def test_stripe_config_returns_publishable_key(self):
        """stripe-config returns publishable_key and enabled=true"""
        response = requests.get(f"{BASE_URL}/api/wallet/stripe-config")
        assert response.status_code == 200, f"stripe-config failed: {response.text}"
        data = response.json()
        assert "publishable_key" in data, "No publishable_key in response"
        assert "enabled" in data, "No enabled in response"
        assert data["enabled"] is True, "Stripe Elements should be enabled"
        assert data["publishable_key"].startswith("pk_"), "Invalid publishable key format"
        print(f"✓ stripe-config: enabled={data['enabled']}, pk={data['publishable_key'][:20]}...")


class TestSetupIntent:
    """POST /api/wallet/cards/setup-intent tests"""
    
    @pytest.fixture
    def fan_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_setup_intent_requires_auth(self):
        """setup-intent returns 401/403 without token"""
        response = requests.post(f"{BASE_URL}/api/wallet/cards/setup-intent")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ setup-intent requires auth (got {response.status_code})")
    
    def test_setup_intent_creates_customer(self, fan_token):
        """setup-intent returns client_secret, customer_id, publishable_key"""
        headers = {"Authorization": f"Bearer {fan_token}"}
        response = requests.post(f"{BASE_URL}/api/wallet/cards/setup-intent", headers=headers)
        assert response.status_code == 200, f"setup-intent failed: {response.text}"
        data = response.json()
        assert "client_secret" in data, "No client_secret in response"
        assert "customer_id" in data, "No customer_id in response"
        assert "publishable_key" in data, "No publishable_key in response"
        assert data["customer_id"].startswith("cus_"), "Invalid customer_id format"
        assert data["client_secret"].startswith("seti_"), "Invalid client_secret format"
        print(f"✓ setup-intent: customer_id={data['customer_id']}, client_secret={data['client_secret'][:30]}...")
        return data["customer_id"]
    
    def test_setup_intent_same_customer_on_second_call(self, fan_token):
        """Calling setup-intent twice returns SAME customer_id (no duplicate)"""
        headers = {"Authorization": f"Bearer {fan_token}"}
        
        # First call
        response1 = requests.post(f"{BASE_URL}/api/wallet/cards/setup-intent", headers=headers)
        assert response1.status_code == 200
        customer_id_1 = response1.json()["customer_id"]
        
        # Second call
        response2 = requests.post(f"{BASE_URL}/api/wallet/cards/setup-intent", headers=headers)
        assert response2.status_code == 200
        customer_id_2 = response2.json()["customer_id"]
        
        assert customer_id_1 == customer_id_2, f"Customer ID changed: {customer_id_1} vs {customer_id_2}"
        print(f"✓ setup-intent returns same customer_id on second call: {customer_id_1}")


class TestCardsEndpoints:
    """GET/POST/DELETE /api/wallet/cards/* tests"""
    
    @pytest.fixture
    def fan_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_list_cards_requires_auth(self):
        """GET /api/wallet/cards returns 401/403 without token"""
        response = requests.get(f"{BASE_URL}/api/wallet/cards")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ list cards requires auth (got {response.status_code})")
    
    def test_list_cards_returns_array(self, fan_token):
        """GET /api/wallet/cards returns array (may be empty)"""
        headers = {"Authorization": f"Bearer {fan_token}"}
        response = requests.get(f"{BASE_URL}/api/wallet/cards", headers=headers)
        assert response.status_code == 200, f"list cards failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ list cards returns {len(data)} cards")
    
    def test_confirm_card_requires_auth(self):
        """POST /api/wallet/cards/confirm returns 401/403 without token"""
        response = requests.post(f"{BASE_URL}/api/wallet/cards/confirm", json={
            "payment_method_id": "pm_fake_123"
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ confirm card requires auth (got {response.status_code})")
    
    def test_confirm_card_invalid_pm_returns_400(self, fan_token):
        """POST /api/wallet/cards/confirm with invalid payment_method_id returns 400"""
        headers = {"Authorization": f"Bearer {fan_token}"}
        response = requests.post(f"{BASE_URL}/api/wallet/cards/confirm", headers=headers, json={
            "payment_method_id": "pm_invalid_does_not_exist_123"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "introuvable" in data.get("detail", "").lower() or "not found" in data.get("detail", "").lower(), \
            f"Expected 'introuvable' in error, got: {data}"
        print(f"✓ confirm card with invalid PM returns 400: {data.get('detail')}")
    
    def test_delete_card_requires_auth(self):
        """DELETE /api/wallet/cards/{card_id} returns 401/403 without token"""
        response = requests.delete(f"{BASE_URL}/api/wallet/cards/pm_fake_123")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ delete card requires auth (got {response.status_code})")
    
    def test_delete_card_not_found_returns_404(self, fan_token):
        """DELETE /api/wallet/cards/{card_id} returns 404 when card does not exist"""
        headers = {"Authorization": f"Bearer {fan_token}"}
        response = requests.delete(f"{BASE_URL}/api/wallet/cards/pm_nonexistent_card_123", headers=headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print(f"✓ delete non-existent card returns 404")
    
    def test_set_default_card_requires_auth(self):
        """POST /api/wallet/cards/{card_id}/default returns 401/403 without token"""
        response = requests.post(f"{BASE_URL}/api/wallet/cards/pm_fake_123/default")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ set default card requires auth (got {response.status_code})")
    
    def test_set_default_card_not_found_returns_404(self, fan_token):
        """POST /api/wallet/cards/{card_id}/default returns 404 when card does not exist"""
        headers = {"Authorization": f"Bearer {fan_token}"}
        response = requests.post(f"{BASE_URL}/api/wallet/cards/pm_nonexistent_card_123/default", headers=headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print(f"✓ set default non-existent card returns 404")


class TestWalletRegression:
    """Regression tests for existing wallet endpoints"""
    
    @pytest.fixture
    def fan_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_wallet_balance(self, fan_token):
        """REGRESSION: GET /api/wallet returns coin balance"""
        headers = {"Authorization": f"Bearer {fan_token}"}
        response = requests.get(f"{BASE_URL}/api/wallet", headers=headers)
        assert response.status_code == 200, f"wallet failed: {response.text}"
        data = response.json()
        assert "coin_balance" in data, "No coin_balance in response"
        assert isinstance(data["coin_balance"], int), "coin_balance should be int"
        print(f"✓ wallet balance: {data['coin_balance']} coins")
    
    def test_wallet_packs(self, fan_token):
        """REGRESSION: GET /api/wallet/packs returns 4 packs"""
        headers = {"Authorization": f"Bearer {fan_token}"}
        response = requests.get(f"{BASE_URL}/api/wallet/packs", headers=headers)
        assert response.status_code == 200, f"packs failed: {response.text}"
        data = response.json()
        assert len(data) == 4, f"Expected 4 packs, got {len(data)}"
        pack_ids = [p["pack_id"] for p in data]
        assert "starter" in pack_ids
        assert "popular" in pack_ids
        assert "premium" in pack_ids
        assert "vip" in pack_ids
        print(f"✓ wallet packs: {pack_ids}")
    
    def test_coin_pack_checkout(self, fan_token):
        """REGRESSION: POST /api/wallet/buy (pack_id=starter) returns valid Stripe Checkout URL"""
        headers = {"Authorization": f"Bearer {fan_token}"}
        response = requests.post(f"{BASE_URL}/api/wallet/buy", headers=headers, json={
            "pack_id": "starter",
            "origin_url": "https://fan-culture.preview.emergentagent.com/wallet"
        })
        assert response.status_code == 200, f"buy pack failed: {response.text}"
        data = response.json()
        # API returns 'url' not 'checkout_url'
        assert "url" in data, "No url in response"
        assert "checkout.stripe.com" in data["url"], "Invalid checkout URL"
        print(f"✓ coin pack checkout URL: {data['url'][:60]}...")


class TestAdminRegression:
    """Regression tests for admin endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_admin_stats(self, admin_token):
        """REGRESSION: GET /api/admin/stats works"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/stats", headers=headers)
        assert response.status_code == 200, f"admin stats failed: {response.text}"
        data = response.json()
        assert "users_count" in data
        assert "creators_count" in data
        print(f"✓ admin stats: {data['users_count']} users, {data['creators_count']} creators")


class TestCreatorRegression:
    """Regression tests for creator endpoints"""
    
    @pytest.fixture
    def creator_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CREATOR_EMAIL,
            "password": CREATOR_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_creators_list(self):
        """REGRESSION: GET /api/creators works"""
        response = requests.get(f"{BASE_URL}/api/creators")
        assert response.status_code == 200, f"creators list failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ creators list: {len(data)} creators")
    
    def test_bank_iban_update(self, creator_token):
        """REGRESSION: POST /api/payouts/bank IBAN update works"""
        headers = {"Authorization": f"Bearer {creator_token}"}
        response = requests.post(f"{BASE_URL}/api/payouts/bank", headers=headers, json={
            "iban": TEST_IBAN,
            "holder_name": "Lyse Press",
            "country": "FR"
        })
        assert response.status_code == 200, f"bank update failed: {response.text}"
        data = response.json()
        assert "ok" in data or "iban" in data, f"Unexpected response: {data}"
        print(f"✓ bank IBAN update successful")
    
    def test_bank_get_masked(self, creator_token):
        """REGRESSION: GET /api/payouts/bank returns masked IBAN"""
        headers = {"Authorization": f"Bearer {creator_token}"}
        response = requests.get(f"{BASE_URL}/api/payouts/bank", headers=headers)
        assert response.status_code == 200, f"bank get failed: {response.text}"
        data = response.json()
        if data:  # May be empty if no bank saved
            assert "iban_masked" in data, "No iban_masked in response"
            # Raw IBAN should NOT be leaked
            assert "iban" not in data or data.get("iban") == data.get("iban_masked"), \
                "Raw IBAN should not be leaked"
        print(f"✓ bank get: masked IBAN returned")


class TestStripeCustomerPersistence:
    """Verify stripe_customer_id is persisted in MongoDB"""
    
    def test_customer_id_persisted_after_setup_intent(self):
        """After setup-intent, user should have stripe_customer_id in their profile"""
        # Create a fresh user to avoid stale stripe_customer_id from previous tests
        import uuid
        unique_email = f"test_stripe_{uuid.uuid4().hex[:8]}@meandyou.fans"
        
        # Register new user
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass2026!",
            "name": "Stripe Test User",
            "birthdate": "1990-01-01"
        })
        assert reg_response.status_code == 200, f"Registration failed: {reg_response.text}"
        token = reg_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Create setup intent (this creates Stripe customer)
        response = requests.post(f"{BASE_URL}/api/wallet/cards/setup-intent", headers=headers)
        assert response.status_code == 200, f"setup-intent failed: {response.text}"
        customer_id = response.json()["customer_id"]
        assert customer_id.startswith("cus_"), f"Invalid customer_id: {customer_id}"
        
        # Call setup-intent again to verify same customer_id is returned (persisted)
        response2 = requests.post(f"{BASE_URL}/api/wallet/cards/setup-intent", headers=headers)
        assert response2.status_code == 200, f"second setup-intent failed: {response2.text}"
        customer_id_2 = response2.json()["customer_id"]
        
        assert customer_id == customer_id_2, f"Customer ID should be persisted and reused: {customer_id} vs {customer_id_2}"
        print(f"✓ stripe_customer_id persisted: {customer_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
