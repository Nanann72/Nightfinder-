"""
Iteration 20 - Admin Features Tests
Tests for:
1. Admin ban/unban users (POST /admin/users/:id/ban + unban)
2. Admin grant/deduct coins (POST /admin/users/:id/grant-coins + deduct-coins)
3. Google OAuth direct (GET /auth/google/config + POST /auth/google/direct) — non configuré, doit fallback
4. LiveKit en mode LIVE (plus demo) — clés ajoutées
5. Regression tests iter 16/17/18/19
"""

import pytest
import requests
import os
import uuid
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@meandyou.fans",
        "password": "Admin2026!"
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    data = response.json()
    return data["access_token"], data["user"]["user_id"]

@pytest.fixture(scope="module")
def fan_token():
    """Get fan authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "fan@meandyou.fans",
        "password": "TestFan2026!"
    })
    assert response.status_code == 200, f"Fan login failed: {response.text}"
    data = response.json()
    return data["access_token"], data["user"]["user_id"]

@pytest.fixture
def fresh_test_user():
    """Create a fresh test user for ban/coin tests"""
    unique_id = uuid.uuid4().hex[:8]
    email = f"test_ban_{unique_id}@meandyou.fans"
    password = "Test12345!"
    
    response = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": password,
        "name": f"Test Ban User {unique_id}",
        "is_creator": False
    })
    assert response.status_code == 200, f"Registration failed: {response.text}"
    data = response.json()
    return {
        "token": data["access_token"],
        "user_id": data["user"]["user_id"],
        "email": email,
        "password": password
    }

@pytest.fixture
def fresh_creator_token():
    """Create a fresh creator account for live testing"""
    unique_id = uuid.uuid4().hex[:8]
    email = f"test_creator_{unique_id}@meandyou.fans"
    password = "Test12345!"
    
    response = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": password,
        "name": f"Test Creator {unique_id}",
        "is_creator": True
    })
    assert response.status_code == 200, f"Registration failed: {response.text}"
    data = response.json()
    return data["access_token"], email, data["user"]["user_id"]


# ============================================================================
# TEST CLASS: Admin Ban/Unban
# ============================================================================

class TestAdminBanUnban:
    """Tests for POST /api/admin/users/{user_id}/ban and /unban"""
    
    def test_admin_ban_user(self, admin_token, fresh_test_user):
        """Admin can ban a user - DB should have banned=true, banned_at, banned_by"""
        token, admin_id = admin_token
        user = fresh_test_user
        
        response = requests.post(
            f"{BASE_URL}/api/admin/users/{user['user_id']}/ban",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Ban failed: {response.text}"
        data = response.json()
        
        assert data["ok"] == True
        assert data["email"] == user["email"]
        print(f"✓ Admin ban user successful: {data}")
    
    def test_admin_unban_user(self, admin_token, fresh_test_user):
        """Admin can unban a user - DB should have banned=false, banned_at unset"""
        token, admin_id = admin_token
        user = fresh_test_user
        
        # First ban the user
        ban_response = requests.post(
            f"{BASE_URL}/api/admin/users/{user['user_id']}/ban",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert ban_response.status_code == 200
        
        # Then unban
        response = requests.post(
            f"{BASE_URL}/api/admin/users/{user['user_id']}/unban",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Unban failed: {response.text}"
        data = response.json()
        
        assert data["ok"] == True
        print(f"✓ Admin unban user successful: {data}")
    
    def test_admin_cannot_self_ban(self, admin_token):
        """Admin cannot ban themselves - should return 400"""
        token, admin_id = admin_token
        
        response = requests.post(
            f"{BASE_URL}/api/admin/users/{admin_id}/ban",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print(f"✓ Admin self-ban correctly rejected: {response.json()}")
    
    def test_banned_user_cannot_access_auth_me(self, admin_token, fresh_test_user):
        """After ban, user's token should return 403 on /auth/me"""
        admin_tok, _ = admin_token
        user = fresh_test_user
        
        # Verify user can access /auth/me before ban
        me_before = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {user['token']}"}
        )
        assert me_before.status_code == 200, f"User should access /auth/me before ban: {me_before.text}"
        
        # Admin bans the user
        ban_response = requests.post(
            f"{BASE_URL}/api/admin/users/{user['user_id']}/ban",
            headers={"Authorization": f"Bearer {admin_tok}"}
        )
        assert ban_response.status_code == 200
        
        # User tries to access /auth/me after ban - should get 403
        me_after = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {user['token']}"}
        )
        assert me_after.status_code == 403, f"Expected 403 for banned user, got {me_after.status_code}: {me_after.text}"
        print(f"✓ Banned user correctly blocked from /auth/me: {me_after.json()}")
    
    def test_fan_cannot_ban_user(self, fan_token, fresh_test_user):
        """Fan (non-admin) cannot ban users - should return 403"""
        token, _ = fan_token
        user = fresh_test_user
        
        response = requests.post(
            f"{BASE_URL}/api/admin/users/{user['user_id']}/ban",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print(f"✓ Fan correctly rejected from ban endpoint")
    
    def test_ban_nonexistent_user(self, admin_token):
        """Banning non-existent user should return 404"""
        token, _ = admin_token
        
        response = requests.post(
            f"{BASE_URL}/api/admin/users/nonexistent_user_12345/ban",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print(f"✓ Ban nonexistent user correctly returns 404")


# ============================================================================
# TEST CLASS: Admin Grant/Deduct Coins
# ============================================================================

class TestAdminGrantDeductCoins:
    """Tests for POST /api/admin/users/{user_id}/grant-coins and /deduct-coins"""
    
    def test_admin_grant_coins(self, admin_token, fresh_test_user):
        """Admin can grant coins - wallet balance should increase, notification created"""
        token, admin_id = admin_token
        user = fresh_test_user
        
        response = requests.post(
            f"{BASE_URL}/api/admin/users/{user['user_id']}/grant-coins",
            headers={"Authorization": f"Bearer {token}"},
            json={"amount": 250, "reason": "test_grant"}
        )
        assert response.status_code == 200, f"Grant coins failed: {response.text}"
        data = response.json()
        
        assert data["ok"] == True
        assert data["granted"] == 250
        assert "new_balance" in data
        assert data["new_balance"] >= 250  # Could have had coins before
        print(f"✓ Admin grant coins successful: {data}")
    
    def test_admin_deduct_coins_full(self, admin_token, fresh_test_user):
        """Admin can deduct coins - wallet balance should decrease"""
        token, admin_id = admin_token
        user = fresh_test_user
        
        # First grant some coins
        grant_response = requests.post(
            f"{BASE_URL}/api/admin/users/{user['user_id']}/grant-coins",
            headers={"Authorization": f"Bearer {token}"},
            json={"amount": 200, "reason": "setup_for_deduct"}
        )
        assert grant_response.status_code == 200
        balance_after_grant = grant_response.json()["new_balance"]
        
        # Now deduct
        response = requests.post(
            f"{BASE_URL}/api/admin/users/{user['user_id']}/deduct-coins",
            headers={"Authorization": f"Bearer {token}"},
            json={"amount": 100, "reason": "test_deduct"}
        )
        assert response.status_code == 200, f"Deduct coins failed: {response.text}"
        data = response.json()
        
        assert data["ok"] == True
        assert data["deducted"] == 100
        assert data["new_balance"] == balance_after_grant - 100
        print(f"✓ Admin deduct coins successful: {data}")
    
    def test_admin_deduct_coins_capped_to_balance(self, admin_token, fresh_test_user):
        """Deducting more than balance should cap to current balance"""
        token, admin_id = admin_token
        user = fresh_test_user
        
        # Grant exactly 50 coins
        grant_response = requests.post(
            f"{BASE_URL}/api/admin/users/{user['user_id']}/grant-coins",
            headers={"Authorization": f"Bearer {token}"},
            json={"amount": 50, "reason": "setup_for_cap_test"}
        )
        assert grant_response.status_code == 200
        balance = grant_response.json()["new_balance"]
        
        # Try to deduct 100 (more than balance)
        response = requests.post(
            f"{BASE_URL}/api/admin/users/{user['user_id']}/deduct-coins",
            headers={"Authorization": f"Bearer {token}"},
            json={"amount": 100, "reason": "test_cap"}
        )
        assert response.status_code == 200, f"Deduct coins failed: {response.text}"
        data = response.json()
        
        assert data["ok"] == True
        assert data["deducted"] == balance  # Should be capped to current balance
        assert data["new_balance"] == 0
        print(f"✓ Admin deduct coins capped correctly: deducted={data['deducted']}, new_balance={data['new_balance']}")
    
    def test_fan_cannot_grant_coins(self, fan_token, fresh_test_user):
        """Fan (non-admin) cannot grant coins - should return 403"""
        token, _ = fan_token
        user = fresh_test_user
        
        response = requests.post(
            f"{BASE_URL}/api/admin/users/{user['user_id']}/grant-coins",
            headers={"Authorization": f"Bearer {token}"},
            json={"amount": 100, "reason": "test"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print(f"✓ Fan correctly rejected from grant-coins endpoint")
    
    def test_grant_coins_creates_notification(self, admin_token, fresh_test_user):
        """Granting coins should create a notification for the user"""
        token, admin_id = admin_token
        user = fresh_test_user
        
        # Grant coins
        grant_response = requests.post(
            f"{BASE_URL}/api/admin/users/{user['user_id']}/grant-coins",
            headers={"Authorization": f"Bearer {token}"},
            json={"amount": 100, "reason": "notification_test"}
        )
        assert grant_response.status_code == 200
        
        # Check user's notifications
        notif_response = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {user['token']}"}
        )
        assert notif_response.status_code == 200, f"Get notifications failed: {notif_response.text}"
        notif_data = notif_response.json()
        
        # Response format is {"items": [...], "unread": N}
        notifications = notif_data.get("items", notif_data) if isinstance(notif_data, dict) else notif_data
        
        # Find the admin_grant notification (kind field, not type)
        admin_grant_notifs = [n for n in notifications if n.get("kind") == "admin_grant"]
        assert len(admin_grant_notifs) > 0, f"No admin_grant notification found: {notifications}"
        print(f"✓ Grant coins notification created: {admin_grant_notifs[0]}")


# ============================================================================
# TEST CLASS: Google OAuth Config
# ============================================================================

class TestGoogleOAuthConfig:
    """Tests for Google OAuth endpoints (not configured - fallback mode)"""
    
    def test_google_config_returns_direct_false(self):
        """GET /auth/google/config should return direct:false when not configured"""
        response = requests.get(f"{BASE_URL}/api/auth/google/config")
        assert response.status_code == 200, f"Google config failed: {response.text}"
        data = response.json()
        
        assert data["direct"] == False, f"Expected direct=false, got {data}"
        assert data["client_id"] is None, f"Expected client_id=null, got {data}"
        print(f"✓ Google OAuth config correct (fallback mode): {data}")
    
    def test_google_direct_returns_503(self):
        """POST /auth/google/direct should return 503 when not configured"""
        response = requests.post(
            f"{BASE_URL}/api/auth/google/direct",
            json={"code": "test_code", "redirect_uri": "https://example.com/callback"}
        )
        assert response.status_code == 503, f"Expected 503, got {response.status_code}: {response.text}"
        data = response.json()
        assert "non configuré" in data.get("detail", "").lower() or "not configured" in data.get("detail", "").lower()
        print(f"✓ Google direct correctly returns 503: {data}")


# ============================================================================
# TEST CLASS: LiveKit LIVE Mode
# ============================================================================

class TestLiveKitLiveMode:
    """Tests for LiveKit in LIVE mode (not demo)"""
    
    def test_live_config_enabled(self):
        """GET /live/config should return enabled:true with real URL"""
        response = requests.get(f"{BASE_URL}/api/live/config")
        assert response.status_code == 200, f"Live config failed: {response.text}"
        data = response.json()
        
        assert data["enabled"] == True, f"Expected enabled=true, got {data}"
        assert data["url"] is not None, f"Expected url to be set, got {data}"
        assert "wss://" in data["url"], f"Expected wss:// URL, got {data['url']}"
        assert "meandyou-fans" in data["url"], f"Expected meandyou-fans in URL, got {data['url']}"
        print(f"✓ LiveKit config correct (LIVE mode): {data}")
    
    def test_live_start_returns_real_token(self, fresh_creator_token):
        """POST /live/start should return demo_mode:false and valid JWT token"""
        token, email, user_id = fresh_creator_token
        
        response = requests.post(
            f"{BASE_URL}/api/live/start",
            headers={"Authorization": f"Bearer {token}"},
            json={"title": "Test Live Stream", "description": "Testing LiveKit", "is_ppv": False}
        )
        assert response.status_code == 200, f"Live start failed: {response.text}"
        data = response.json()
        
        # Verify demo_mode is false
        assert data["demo_mode"] == False, f"Expected demo_mode=false, got {data}"
        
        # Verify URL is real LiveKit URL
        assert data["url"] is not None, f"Expected url to be set, got {data}"
        assert "wss://" in data["url"], f"Expected wss:// URL, got {data['url']}"
        
        # Verify token is a valid JWT (3 parts separated by '.')
        lk_token = data["token"]
        assert lk_token is not None, f"Expected token to be set, got {data}"
        parts = lk_token.split(".")
        assert len(parts) == 3, f"Expected JWT with 3 parts, got {len(parts)} parts"
        assert lk_token.startswith("eyJ"), f"Expected token to start with 'eyJ', got {lk_token[:10]}"
        
        # Verify session data
        session = data["session"]
        assert session["status"] == "live"
        assert session["demo_mode"] == False
        assert session["creator_id"] == user_id
        
        print(f"✓ Live start successful (LIVE mode): demo_mode={data['demo_mode']}, url={data['url']}, token_valid=True")


# ============================================================================
# TEST CLASS: Regression Tests from Iterations 16-19
# ============================================================================

class TestRegressionIter16:
    """Regression tests from iteration 16"""
    
    def test_wallet_packs(self):
        """GET /wallet/packs should return 4 packs"""
        response = requests.get(f"{BASE_URL}/api/wallet/packs")
        assert response.status_code == 200, f"Wallet packs failed: {response.text}"
        data = response.json()
        
        assert len(data) == 4, f"Expected 4 packs, got {len(data)}"
        pack_names = [p["name"] for p in data]
        assert "Starter" in pack_names
        assert "Popular" in pack_names
        print(f"✓ Wallet packs: {len(data)} packs available")
    
    def test_creators_list(self):
        """GET /creators should return list"""
        response = requests.get(f"{BASE_URL}/api/creators")
        assert response.status_code == 200, f"Creators list failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Creators list: {len(data)} creators")
    
    def test_admin_users_has_creator_profile(self, admin_token):
        """GET /admin/users should include has_creator_profile field"""
        token, _ = admin_token
        
        response = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {token}"},
            params={"limit": 10}
        )
        assert response.status_code == 200, f"Admin users failed: {response.text}"
        data = response.json()
        
        assert len(data) > 0, "Expected at least one user"
        # Check that has_creator_profile field exists
        for user in data:
            assert "has_creator_profile" in user, f"Missing has_creator_profile in user: {user}"
        print(f"✓ Admin users has_creator_profile field present")


class TestRegressionIter17:
    """Regression tests from iteration 17"""
    
    def test_newsletter_opt_in_registration(self):
        """Registration with newsletter_opt_in should work"""
        unique_id = uuid.uuid4().hex[:8]
        email = f"test_newsletter_{unique_id}@meandyou.fans"
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "password": "Test12345!",
            "name": f"Newsletter Test {unique_id}",
            "is_creator": False,
            "newsletter_opt_in": True
        })
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        print(f"✓ Newsletter opt-in registration successful")
    
    def test_stripe_live_mode_wallet_buy(self, fan_token):
        """POST /wallet/buy should return cs_live_ session ID"""
        token, _ = fan_token
        
        response = requests.post(
            f"{BASE_URL}/api/wallet/buy",
            headers={"Authorization": f"Bearer {token}"},
            json={"pack_id": "starter", "origin_url": BASE_URL}
        )
        assert response.status_code == 200, f"Wallet buy failed: {response.text}"
        data = response.json()
        
        assert "session_id" in data
        assert data["session_id"].startswith("cs_live_"), f"Expected cs_live_ session, got {data['session_id']}"
        print(f"✓ Stripe LIVE mode wallet buy: {data['session_id'][:20]}...")


class TestRegressionIter18:
    """Regression tests from iteration 18"""
    
    def test_wallet_cards_setup_intent(self, fan_token):
        """POST /wallet/cards/setup-intent should return seti_ and cus_"""
        token, _ = fan_token
        
        response = requests.post(
            f"{BASE_URL}/api/wallet/cards/setup-intent",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Setup intent failed: {response.text}"
        data = response.json()
        
        assert "client_secret" in data
        assert data["client_secret"].startswith("seti_"), f"Expected seti_ secret, got {data['client_secret'][:10]}"
        assert "customer_id" in data
        assert data["customer_id"].startswith("cus_"), f"Expected cus_ customer, got {data['customer_id']}"
        print(f"✓ Setup intent: {data['client_secret'][:15]}..., customer: {data['customer_id']}")
    
    def test_auth_me(self, fan_token):
        """GET /auth/me should return user data"""
        token, user_id = fan_token
        
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Auth me failed: {response.text}"
        data = response.json()
        
        assert "user_id" in data
        assert "email" in data
        print(f"✓ Auth me: {data['email']}")


class TestRegressionIter19:
    """Regression tests from iteration 19 - Stripe Connect"""
    
    def test_stripe_connect_status_fresh_creator(self, fresh_creator_token):
        """Fresh creator should have connected:false"""
        token, email, user_id = fresh_creator_token
        
        response = requests.get(
            f"{BASE_URL}/api/creators/me/stripe-connect/status",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Status failed: {response.text}"
        data = response.json()
        
        assert data["connected"] == False
        assert data["charges_enabled"] == False
        print(f"✓ Stripe Connect status (fresh creator): connected={data['connected']}")
    
    def test_stripe_connect_onboard(self, fresh_creator_token):
        """POST /creators/me/stripe-connect/onboard should return URL"""
        token, email, user_id = fresh_creator_token
        
        response = requests.post(
            f"{BASE_URL}/api/creators/me/stripe-connect/onboard",
            headers={"Authorization": f"Bearer {token}"},
            json={"origin_url": BASE_URL, "return_url": f"{BASE_URL}/dashboard"}
        )
        assert response.status_code == 200, f"Onboard failed: {response.text}"
        data = response.json()
        
        assert "url" in data
        assert data["url"].startswith("https://connect.stripe.com/")
        assert "account_id" in data
        assert data["account_id"].startswith("acct_")
        print(f"✓ Stripe Connect onboard: account={data['account_id']}")


# ============================================================================
# MAIN EXECUTION
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
