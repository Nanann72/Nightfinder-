"""
Iteration 10 - Lot 4 Backend Tests
Tests for: Live streaming, Mass messaging (broadcast), Paid media in DMs, Subscription bundles
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fan-culture.preview.emergentagent.com').rstrip('/')

# Test credentials from test_credentials.md
FAN_EMAIL = "fan@meandyou.fans"
FAN_PASSWORD = "TestFan2026!"
CREATOR_EMAIL = "lysepress@meandyou.fans"
CREATOR_PASSWORD = "Creator2026!"
ADMIN_EMAIL = "admin@meandyou.fans"
ADMIN_PASSWORD = "Admin2026!"


class TestAuth:
    """Authentication tests - ensure we can login"""
    
    def test_login_fan(self, api_client):
        """Test fan login"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        assert response.status_code == 200, f"Fan login failed: {response.text}"
        data = response.json()
        assert "user" in data
        assert data["user"]["email"] == FAN_EMAIL
        print(f"✓ Fan login successful: {data['user']['name']}")
    
    def test_login_creator(self, api_client):
        """Test creator login"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": CREATOR_EMAIL,
            "password": CREATOR_PASSWORD
        })
        assert response.status_code == 200, f"Creator login failed: {response.text}"
        data = response.json()
        assert "user" in data
        assert data["user"]["role"] == "creator"
        print(f"✓ Creator login successful: {data['user']['name']}")


class TestLiveEndpoints:
    """Live streaming endpoint tests"""
    
    def test_live_active_list_public(self, api_client):
        """GET /api/live/active - should return list of active lives (public)"""
        response = api_client.get(f"{BASE_URL}/api/live/active")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/live/active returns {len(data)} active lives")
    
    def test_live_config(self, api_client):
        """GET /api/live/config - should return LiveKit config"""
        response = api_client.get(f"{BASE_URL}/api/live/config")
        assert response.status_code == 200
        data = response.json()
        assert "enabled" in data
        print(f"✓ GET /api/live/config: enabled={data['enabled']}")
    
    def test_live_start_requires_creator(self, fan_client):
        """POST /api/live/start - should fail for non-creator"""
        response = fan_client.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Live",
            "description": "Test",
            "is_ppv": False,
            "ppv_coins": 0
        })
        assert response.status_code == 403, f"Expected 403 for fan, got {response.status_code}"
        print("✓ POST /api/live/start correctly rejects non-creator")
    
    def test_live_start_creator(self, creator_client):
        """POST /api/live/start - creator can start a live"""
        response = creator_client.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Live Session",
            "description": "Testing live functionality",
            "is_ppv": False,
            "ppv_coins": 0
        })
        assert response.status_code == 200, f"Live start failed: {response.text}"
        data = response.json()
        assert "session" in data
        assert data["session"]["status"] == "live"
        assert "session_id" in data["session"]
        assert "demo_mode" in data
        print(f"✓ POST /api/live/start: session_id={data['session']['session_id']}, demo_mode={data['demo_mode']}")
        return data["session"]["session_id"]
    
    def test_live_get_session(self, creator_client):
        """GET /api/live/{session_id} - get live session details"""
        # First start a live
        start_resp = creator_client.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Get Session",
            "is_ppv": False,
            "ppv_coins": 0
        })
        assert start_resp.status_code == 200
        session_id = start_resp.json()["session"]["session_id"]
        
        # Get session details
        response = creator_client.get(f"{BASE_URL}/api/live/{session_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == session_id
        assert data["status"] == "live"
        print(f"✓ GET /api/live/{session_id}: title={data['title']}")
        
        # Stop the live
        creator_client.post(f"{BASE_URL}/api/live/{session_id}/stop")
    
    def test_live_join(self, creator_client, fan_client):
        """POST /api/live/{session_id}/join - fan joins live"""
        # Creator starts live
        start_resp = creator_client.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Join Live",
            "is_ppv": False,
            "ppv_coins": 0
        })
        assert start_resp.status_code == 200
        session_id = start_resp.json()["session"]["session_id"]
        
        # Fan joins
        join_resp = fan_client.post(f"{BASE_URL}/api/live/{session_id}/join")
        assert join_resp.status_code == 200
        data = join_resp.json()
        assert "token" in data
        assert "demo_mode" in data
        print(f"✓ POST /api/live/{session_id}/join: fan joined, demo_mode={data['demo_mode']}")
        
        # Stop the live
        creator_client.post(f"{BASE_URL}/api/live/{session_id}/stop")
    
    def test_live_chat(self, creator_client, fan_client):
        """POST /api/live/{session_id}/chat - send chat message"""
        # Creator starts live
        start_resp = creator_client.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Chat Live",
            "is_ppv": False,
            "ppv_coins": 0
        })
        session_id = start_resp.json()["session"]["session_id"]
        
        # Fan joins
        fan_client.post(f"{BASE_URL}/api/live/{session_id}/join")
        
        # Fan sends chat
        chat_resp = fan_client.post(f"{BASE_URL}/api/live/{session_id}/chat", json={
            "body": "Hello from test!"
        })
        assert chat_resp.status_code == 200
        data = chat_resp.json()
        assert data["body"] == "Hello from test!"
        assert "message_id" in data
        print(f"✓ POST /api/live/{session_id}/chat: message sent")
        
        # Get chat messages
        chat_list = fan_client.get(f"{BASE_URL}/api/live/{session_id}/chat")
        assert chat_list.status_code == 200
        messages = chat_list.json()
        assert len(messages) >= 1
        print(f"✓ GET /api/live/{session_id}/chat: {len(messages)} messages")
        
        # Stop the live
        creator_client.post(f"{BASE_URL}/api/live/{session_id}/stop")
    
    def test_live_tip(self, creator_client, fan_client):
        """POST /api/live/{session_id}/tip - fan tips during live"""
        # Creator starts live
        start_resp = creator_client.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Tip Live",
            "is_ppv": False,
            "ppv_coins": 0
        })
        session_id = start_resp.json()["session"]["session_id"]
        
        # Fan joins
        fan_client.post(f"{BASE_URL}/api/live/{session_id}/join")
        
        # Fan tips
        tip_resp = fan_client.post(f"{BASE_URL}/api/live/{session_id}/tip", json={
            "coins": 25,
            "message": "Great stream!"
        })
        assert tip_resp.status_code == 200
        data = tip_resp.json()
        assert data["ok"] == True
        assert data["coins"] == 25
        print(f"✓ POST /api/live/{session_id}/tip: 25 coins tipped")
        
        # Stop the live
        creator_client.post(f"{BASE_URL}/api/live/{session_id}/stop")
    
    def test_live_stop(self, creator_client):
        """POST /api/live/{session_id}/stop - creator stops live"""
        # Start live
        start_resp = creator_client.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Stop Live",
            "is_ppv": False,
            "ppv_coins": 0
        })
        session_id = start_resp.json()["session"]["session_id"]
        
        # Stop live
        stop_resp = creator_client.post(f"{BASE_URL}/api/live/{session_id}/stop")
        assert stop_resp.status_code == 200
        data = stop_resp.json()
        assert data["ok"] == True
        print(f"✓ POST /api/live/{session_id}/stop: live ended")
        
        # Verify it's ended
        get_resp = creator_client.get(f"{BASE_URL}/api/live/{session_id}")
        assert get_resp.json()["status"] == "ended"
    
    def test_live_ppv_flow(self, creator_client, fan_client):
        """Test PPV live - fan must pay to join"""
        # Creator starts PPV live
        start_resp = creator_client.post(f"{BASE_URL}/api/live/start", json={
            "title": "PPV Test Live",
            "description": "Pay to watch",
            "is_ppv": True,
            "ppv_coins": 50
        })
        assert start_resp.status_code == 200
        session_id = start_resp.json()["session"]["session_id"]
        
        # Check session shows PPV
        get_resp = fan_client.get(f"{BASE_URL}/api/live/{session_id}")
        assert get_resp.status_code == 200
        session = get_resp.json()
        assert session["is_ppv"] == True
        assert session["ppv_coins"] == 50
        assert session["has_access"] == False  # Fan hasn't paid yet
        print(f"✓ PPV live created: {session_id}, ppv_coins=50, has_access=False")
        
        # Fan joins (pays PPV)
        join_resp = fan_client.post(f"{BASE_URL}/api/live/{session_id}/join")
        assert join_resp.status_code == 200
        print(f"✓ Fan joined PPV live (paid 50 coins)")
        
        # Verify access now
        get_resp2 = fan_client.get(f"{BASE_URL}/api/live/{session_id}")
        assert get_resp2.json()["has_access"] == True
        print(f"✓ Fan now has_access=True after payment")
        
        # Stop the live
        creator_client.post(f"{BASE_URL}/api/live/{session_id}/stop")


class TestBroadcastEndpoint:
    """Mass messaging (broadcast) endpoint tests"""
    
    def test_broadcast_requires_creator(self, fan_client):
        """POST /api/creators/me/broadcast - should fail for non-creator"""
        response = fan_client.post(f"{BASE_URL}/api/creators/me/broadcast", json={
            "body": "Test broadcast",
            "media_url": None,
            "media_paywall_coins": 0
        })
        assert response.status_code == 403
        print("✓ POST /api/creators/me/broadcast correctly rejects non-creator")
    
    def test_broadcast_creator(self, creator_client):
        """POST /api/creators/me/broadcast - creator sends broadcast"""
        response = creator_client.post(f"{BASE_URL}/api/creators/me/broadcast", json={
            "body": "Test broadcast message from pytest!",
            "media_url": None,
            "media_paywall_coins": 0
        })
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] == True
        assert "count" in data
        assert "broadcast_id" in data
        print(f"✓ POST /api/creators/me/broadcast: sent to {data['count']} subscribers, broadcast_id={data['broadcast_id']}")
    
    def test_broadcast_with_paid_media(self, creator_client):
        """POST /api/creators/me/broadcast - with paid media attachment"""
        response = creator_client.post(f"{BASE_URL}/api/creators/me/broadcast", json={
            "body": "Exclusive content for my fans!",
            "media_url": "https://example.com/test-media.jpg",
            "media_paywall_coins": 100
        })
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] == True
        print(f"✓ Broadcast with paid media (100 coins): sent to {data['count']} subscribers")


class TestMessageMediaUnlock:
    """Paid media in DMs - unlock endpoint tests"""
    
    def test_unlock_message_media_flow(self, creator_client, fan_client):
        """Full flow: creator sends paid media, fan sees locked state"""
        # Get creator info
        me_resp = creator_client.get(f"{BASE_URL}/api/auth/me")
        creator_id = me_resp.json()["user_id"]
        
        # Get fan info
        fan_me = fan_client.get(f"{BASE_URL}/api/auth/me")
        fan_id = fan_me.json()["user_id"]
        
        # Creator sends message with paid media to fan
        msg_resp = creator_client.post(f"{BASE_URL}/api/messages", json={
            "creator_id": creator_id,
            "fan_id": fan_id,
            "body": "Check out this exclusive content!",
            "media_url": "https://example.com/exclusive.jpg",
            "media_paywall_coins": 50
        })
        assert msg_resp.status_code == 200
        message = msg_resp.json()
        message_id = message["message_id"]
        assert message["media_paywall_coins"] == 50
        print(f"✓ Creator sent paid media message: {message_id}, paywall=50 coins")
        
        # Fan fetches thread - should see locked media
        thread_resp = fan_client.get(f"{BASE_URL}/api/messages/{creator_id}")
        assert thread_resp.status_code == 200
        messages = thread_resp.json()
        
        # Find the message we just sent
        locked_msg = next((m for m in messages if m["message_id"] == message_id), None)
        assert locked_msg is not None
        assert locked_msg["is_unlocked"] == False
        assert locked_msg["media_url"] is None  # Hidden until unlocked
        print(f"✓ Fan sees locked message: is_unlocked=False, media_url=None")
        
        # Fan tries to unlock the media - may succeed or fail based on balance
        unlock_resp = fan_client.post(f"{BASE_URL}/api/messages/{message_id}/unlock")
        if unlock_resp.status_code == 200:
            unlock_data = unlock_resp.json()
            assert unlock_data["ok"] == True
            assert unlock_data["media_url"] == "https://example.com/exclusive.jpg"
            print(f"✓ Fan unlocked media: coins_spent={unlock_data.get('coins_spent')}, media_url revealed")
            
            # Verify thread now shows unlocked
            thread_resp2 = fan_client.get(f"{BASE_URL}/api/messages/{creator_id}")
            messages2 = thread_resp2.json()
            unlocked_msg = next((m for m in messages2 if m["message_id"] == message_id), None)
            assert unlocked_msg["is_unlocked"] == True
            assert unlocked_msg["media_url"] == "https://example.com/exclusive.jpg"
            print(f"✓ Thread now shows is_unlocked=True with media_url")
        elif unlock_resp.status_code == 402:
            # Insufficient coins - this is valid behavior
            data = unlock_resp.json()
            assert data["detail"]["error"] == "insufficient_coins"
            print(f"✓ Unlock correctly returns 402 insufficient_coins (needed: {data['detail']['needed']}, balance: {data['detail']['balance']})")
        else:
            pytest.fail(f"Unexpected status: {unlock_resp.status_code}")
    
    def test_unlock_endpoint_exists(self, creator_client, fan_client):
        """POST /api/messages/{message_id}/unlock endpoint exists and validates"""
        # Get creator info
        me_resp = creator_client.get(f"{BASE_URL}/api/auth/me")
        creator_id = me_resp.json()["user_id"]
        fan_me = fan_client.get(f"{BASE_URL}/api/auth/me")
        fan_id = fan_me.json()["user_id"]
        
        # Creator sends paid media
        msg_resp = creator_client.post(f"{BASE_URL}/api/messages", json={
            "creator_id": creator_id,
            "fan_id": fan_id,
            "body": "Another exclusive!",
            "media_url": "https://example.com/exclusive2.jpg",
            "media_paywall_coins": 25
        })
        message_id = msg_resp.json()["message_id"]
        
        # Fan tries to unlock - endpoint should respond (200 or 402)
        unlock_resp = fan_client.post(f"{BASE_URL}/api/messages/{message_id}/unlock")
        assert unlock_resp.status_code in [200, 402], f"Unexpected status: {unlock_resp.status_code}"
        print(f"✓ Unlock endpoint responds with {unlock_resp.status_code}")


class TestSubscriptionBundles:
    """Subscription bundles endpoint tests"""
    
    def test_get_bundles(self, api_client, creator_client):
        """GET /api/creators/{creator_id}/bundles - returns 4 bundle options"""
        # Get creator ID
        me_resp = creator_client.get(f"{BASE_URL}/api/auth/me")
        creator_id = me_resp.json()["user_id"]
        
        response = api_client.get(f"{BASE_URL}/api/creators/{creator_id}/bundles")
        assert response.status_code == 200
        data = response.json()
        
        assert "bundles" in data
        assert "base_monthly" in data
        assert "effective_monthly" in data
        
        bundles = data["bundles"]
        assert len(bundles) == 4
        
        # Verify bundle structure
        months_expected = [1, 3, 6, 12]
        discounts_expected = [0, 10, 20, 30]
        
        for i, bundle in enumerate(bundles):
            assert bundle["months"] == months_expected[i]
            assert bundle["discount_percent"] == discounts_expected[i]
            assert "monthly_eur" in bundle
            assert "total_eur" in bundle
            assert "total_coins" in bundle
            assert "saved_eur" in bundle
        
        print(f"✓ GET /api/creators/{creator_id}/bundles: 4 bundles returned")
        for b in bundles:
            print(f"  - {b['months']} months: {b['discount_percent']}% off, {b['total_coins']} coins")
    
    def test_subscribe_bundle(self, fan_client, creator_client):
        """POST /api/payments/subscribe-bundle - subscribe with bundle"""
        # Get creator ID
        me_resp = creator_client.get(f"{BASE_URL}/api/auth/me")
        creator_id = me_resp.json()["user_id"]
        
        # Get bundles to know the price
        bundles_resp = fan_client.get(f"{BASE_URL}/api/creators/{creator_id}/bundles")
        bundles = bundles_resp.json()["bundles"]
        one_month = bundles[0]  # 1 month, 0% discount
        
        # Subscribe with 1 month bundle
        response = fan_client.post(f"{BASE_URL}/api/payments/subscribe-bundle", json={
            "creator_id": creator_id,
            "months": 1
        })
        
        # Could be 200 (success) or 402 (insufficient coins)
        if response.status_code == 200:
            data = response.json()
            assert data["ok"] == True
            assert data["months"] == 1
            assert "coins_paid" in data
            assert "expires_at" in data
            print(f"✓ POST /api/payments/subscribe-bundle: subscribed for 1 month, paid {data['coins_paid']} coins")
        elif response.status_code == 402:
            data = response.json()
            assert data["detail"]["error"] == "insufficient_coins"
            print(f"✓ POST /api/payments/subscribe-bundle: correctly returns 402 insufficient_coins (needed: {data['detail']['needed']})")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}, {response.text}")
    
    def test_subscribe_bundle_invalid_months(self, fan_client, creator_client):
        """POST /api/payments/subscribe-bundle - invalid months returns 400"""
        me_resp = creator_client.get(f"{BASE_URL}/api/auth/me")
        creator_id = me_resp.json()["user_id"]
        
        response = fan_client.post(f"{BASE_URL}/api/payments/subscribe-bundle", json={
            "creator_id": creator_id,
            "months": 5  # Invalid - only 1, 3, 6, 12 allowed
        })
        assert response.status_code == 400
        print("✓ Invalid bundle months (5) returns 400")


class TestWalletBalance:
    """Verify fan has coins for testing"""
    
    def test_fan_wallet_balance(self, fan_client):
        """Fan should have coins seeded"""
        response = fan_client.get(f"{BASE_URL}/api/wallet")
        assert response.status_code == 200
        data = response.json()
        assert "coin_balance" in data
        print(f"✓ Fan wallet balance: {data['coin_balance']} coins")


# ============ Fixtures ============

@pytest.fixture
def api_client():
    """Unauthenticated requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def fan_client():
    """Authenticated session for fan user"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": FAN_EMAIL,
        "password": FAN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Fan login failed: {response.text}")
    
    return session


@pytest.fixture
def creator_client():
    """Authenticated session for creator user"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": CREATOR_EMAIL,
        "password": CREATOR_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Creator login failed: {response.text}")
    
    return session
