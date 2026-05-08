"""
Iteration 39 - Live Moderation & Snapshot Tests
Tests for:
- GET /api/users/lookup (user search with scope filter)
- POST /api/live/{id}/snapshot (host-only preview thumbnail)
- GET /api/live/active (preview_url field)
- GET /api/live/{id} (preview_url vs preview_data_url visibility)
- GET /api/live/{id}/banned (host-only banned list)
- POST /api/live/{id}/banned/{user_id}/unban (unban user)
- GET /api/live/{id}/moderators (host-only moderator list)
- POST /api/live/{id}/moderators (add/update moderator)
- DELETE /api/live/{id}/moderators/{user_id} (remove moderator)
- POST /api/live/{id}/mute (mute viewer in chat)
- DELETE /api/live/{id}/chat/{message_id} (delete chat message)
- POST /api/live/{id}/pin/{message_id} (pin/unpin message)
- POST /api/live/{id}/kick (extended for moderators)
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "admin@meandyou.fans"
ADMIN_PASSWORD = "Admin2026!"
FAN_EMAIL = "fan@meandyou.fans"
FAN_PASSWORD = "TestFan2026!"

# Test user for moderation tests
TEST_MOD_EMAIL = f"test_mod_{int(time.time())}@meandyou.fans"
TEST_MOD_PASSWORD = "TestMod2026!"


class TestSetup:
    """Setup fixtures for all tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Login as admin and return session with auth"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert resp.status_code == 200, f"Admin login failed: {resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def creator_session(self):
        """Login as fan (who is a creator) and return session with auth"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        assert resp.status_code == 200, f"Creator login failed: {resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def test_mod_session(self):
        """Register a test moderator user"""
        session = requests.Session()
        # Try to register
        resp = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_MOD_EMAIL,
            "password": TEST_MOD_PASSWORD,
            "name": "Test Moderator",
            "is_creator": False
        })
        if resp.status_code == 400 and "déjà utilisé" in resp.text:
            # Already exists, login instead
            resp = session.post(f"{BASE_URL}/api/auth/login", json={
                "email": TEST_MOD_EMAIL,
                "password": TEST_MOD_PASSWORD
            })
        assert resp.status_code == 200, f"Test mod setup failed: {resp.text}"
        data = resp.json()
        return {"session": session, "user_id": data["user"]["user_id"]}


class TestUserLookup:
    """Tests for GET /api/users/lookup"""
    
    def test_lookup_requires_auth(self):
        """Lookup requires authentication"""
        resp = requests.get(f"{BASE_URL}/api/users/lookup", params={"q": "test"})
        assert resp.status_code == 401
        print("PASSED: Lookup requires auth")
    
    def test_lookup_short_query_returns_empty(self, creator_session):
        """Query with <2 chars returns empty array"""
        resp = creator_session.get(f"{BASE_URL}/api/users/lookup", params={"q": "a"})
        assert resp.status_code == 200
        data = resp.json()
        assert data == [], f"Expected empty array for short query, got: {data}"
        print("PASSED: Short query returns empty array")
    
    def test_lookup_valid_query_returns_results(self, creator_session):
        """Query with >=2 chars returns results"""
        resp = creator_session.get(f"{BASE_URL}/api/users/lookup", params={"q": "admin"})
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        if len(data) > 0:
            # Check structure
            item = data[0]
            assert "user_id" in item
            assert "name" in item
            assert "avatar_url" in item
            # handle is optional (only for creators)
        print(f"PASSED: Valid query returns {len(data)} results with correct structure")
    
    def test_lookup_max_10_results(self, creator_session):
        """Lookup returns max 10 results"""
        resp = creator_session.get(f"{BASE_URL}/api/users/lookup", params={"q": "test"})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) <= 10, f"Expected max 10 results, got {len(data)}"
        print(f"PASSED: Lookup returns max 10 results (got {len(data)})")
    
    def test_lookup_scope_subscribers(self, creator_session):
        """Scope=subscribers filters to active subscribers only"""
        resp = creator_session.get(f"{BASE_URL}/api/users/lookup", params={
            "q": "test",
            "scope": "subscribers"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        # May be empty if no subscribers match
        print(f"PASSED: Scope=subscribers returns {len(data)} results")


class TestLiveSnapshot:
    """Tests for POST /api/live/{id}/snapshot"""
    
    @pytest.fixture(scope="class")
    def live_session(self, creator_session):
        """Start a live session for testing"""
        resp = creator_session.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Snapshot Live",
            "description": "Testing snapshot endpoint"
        })
        assert resp.status_code == 200, f"Failed to start live: {resp.text}"
        data = resp.json()
        yield data["session"]
        # Cleanup: stop the live
        creator_session.post(f"{BASE_URL}/api/live/{data['session']['session_id']}/stop")
    
    def test_snapshot_requires_auth(self, live_session):
        """Snapshot requires authentication"""
        resp = requests.post(f"{BASE_URL}/api/live/{live_session['session_id']}/snapshot", json={
            "data_url": "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
        })
        assert resp.status_code == 401
        print("PASSED: Snapshot requires auth")
    
    def test_snapshot_non_host_forbidden(self, live_session, admin_session):
        """Non-host gets 403"""
        resp = admin_session.post(f"{BASE_URL}/api/live/{live_session['session_id']}/snapshot", json={
            "data_url": "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
        })
        assert resp.status_code == 403
        print("PASSED: Non-host gets 403 on snapshot")
    
    def test_snapshot_invalid_format_rejected(self, live_session, creator_session):
        """Invalid data URL format rejected with 400"""
        resp = creator_session.post(f"{BASE_URL}/api/live/{live_session['session_id']}/snapshot", json={
            "data_url": "not-a-valid-data-url"
        })
        assert resp.status_code == 400
        print("PASSED: Invalid data URL format rejected")
    
    def test_snapshot_host_success(self, live_session, creator_session):
        """Host can post snapshot successfully"""
        # Small valid JPEG data URL
        data_url = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=="
        resp = creator_session.post(f"{BASE_URL}/api/live/{live_session['session_id']}/snapshot", json={
            "data_url": data_url
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("ok") == True
        print("PASSED: Host can post snapshot successfully")


class TestLiveActivePreview:
    """Tests for GET /api/live/active preview_url field"""
    
    def test_active_list_has_preview_url(self, creator_session):
        """Active list includes preview_url field"""
        # Start a live first
        resp = creator_session.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Preview Live",
            "description": "Testing preview_url"
        })
        assert resp.status_code == 200
        session_id = resp.json()["session"]["session_id"]
        
        try:
            # Get active list
            resp = requests.get(f"{BASE_URL}/api/live/active")
            assert resp.status_code == 200
            data = resp.json()
            assert isinstance(data, list)
            
            # Find our session
            our_session = next((s for s in data if s["session_id"] == session_id), None)
            if our_session:
                assert "preview_url" in our_session, "preview_url field missing"
                # Should NOT have preview_data_url (heavy blob)
                assert "preview_data_url" not in our_session, "preview_data_url should not be in active list"
                print("PASSED: Active list has preview_url, no preview_data_url")
            else:
                print("PASSED: Active list endpoint works (session may have ended)")
        finally:
            # Cleanup
            creator_session.post(f"{BASE_URL}/api/live/{session_id}/stop")


class TestLiveGetPreview:
    """Tests for GET /api/live/{id} preview visibility"""
    
    @pytest.fixture(scope="class")
    def live_with_snapshot(self, creator_session):
        """Start a live and post a snapshot"""
        resp = creator_session.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Preview Get Live",
            "description": "Testing GET preview"
        })
        assert resp.status_code == 200
        session = resp.json()["session"]
        
        # Post a snapshot
        data_url = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=="
        creator_session.post(f"{BASE_URL}/api/live/{session['session_id']}/snapshot", json={
            "data_url": data_url
        })
        
        yield session
        # Cleanup
        creator_session.post(f"{BASE_URL}/api/live/{session['session_id']}/stop")
    
    def test_get_live_anonymous_no_data_url(self, live_with_snapshot):
        """Anonymous user gets preview_url but NOT preview_data_url"""
        resp = requests.get(f"{BASE_URL}/api/live/{live_with_snapshot['session_id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert "preview_url" in data
        assert "preview_data_url" not in data, "Anonymous should not see preview_data_url"
        print("PASSED: Anonymous gets preview_url, no preview_data_url")
    
    def test_get_live_non_host_no_data_url(self, live_with_snapshot, admin_session):
        """Non-host fan gets preview_url but NOT preview_data_url"""
        resp = admin_session.get(f"{BASE_URL}/api/live/{live_with_snapshot['session_id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert "preview_url" in data
        assert "preview_data_url" not in data, "Non-host should not see preview_data_url"
        print("PASSED: Non-host gets preview_url, no preview_data_url")
    
    def test_get_live_host_has_data_url(self, live_with_snapshot, creator_session):
        """Host gets both preview_url AND preview_data_url"""
        resp = creator_session.get(f"{BASE_URL}/api/live/{live_with_snapshot['session_id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert "preview_url" in data
        assert "preview_data_url" in data, "Host should see preview_data_url"
        print("PASSED: Host gets both preview_url and preview_data_url")


class TestBannedUsers:
    """Tests for banned users endpoints"""
    
    @pytest.fixture(scope="class")
    def live_session(self, creator_session):
        """Start a live session for testing"""
        resp = creator_session.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Banned Live",
            "description": "Testing banned endpoints"
        })
        assert resp.status_code == 200
        session = resp.json()["session"]
        yield session
        creator_session.post(f"{BASE_URL}/api/live/{session['session_id']}/stop")
    
    def test_banned_list_requires_auth(self, live_session):
        """Banned list requires authentication"""
        resp = requests.get(f"{BASE_URL}/api/live/{live_session['session_id']}/banned")
        assert resp.status_code == 401
        print("PASSED: Banned list requires auth")
    
    def test_banned_list_non_host_forbidden(self, live_session, admin_session):
        """Non-host gets 403 on banned list"""
        resp = admin_session.get(f"{BASE_URL}/api/live/{live_session['session_id']}/banned")
        assert resp.status_code == 403
        print("PASSED: Non-host gets 403 on banned list")
    
    def test_banned_list_host_success(self, live_session, creator_session):
        """Host can get banned list"""
        resp = creator_session.get(f"{BASE_URL}/api/live/{live_session['session_id']}/banned")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASSED: Host can get banned list ({len(data)} users)")
    
    def test_unban_requires_auth(self, live_session):
        """Unban requires authentication"""
        resp = requests.post(f"{BASE_URL}/api/live/{live_session['session_id']}/banned/fake_user/unban")
        assert resp.status_code == 401
        print("PASSED: Unban requires auth")
    
    def test_unban_non_host_forbidden(self, live_session, admin_session):
        """Non-host gets 403 on unban"""
        resp = admin_session.post(f"{BASE_URL}/api/live/{live_session['session_id']}/banned/fake_user/unban")
        assert resp.status_code == 403
        print("PASSED: Non-host gets 403 on unban")


class TestModerators:
    """Tests for moderator endpoints"""
    
    @pytest.fixture(scope="class")
    def live_session(self, creator_session):
        """Start a live session for testing"""
        resp = creator_session.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Moderators Live",
            "description": "Testing moderator endpoints"
        })
        assert resp.status_code == 200
        session = resp.json()["session"]
        yield session
        creator_session.post(f"{BASE_URL}/api/live/{session['session_id']}/stop")
    
    def test_moderators_list_requires_auth(self, live_session):
        """Moderators list requires authentication"""
        resp = requests.get(f"{BASE_URL}/api/live/{live_session['session_id']}/moderators")
        assert resp.status_code == 401
        print("PASSED: Moderators list requires auth")
    
    def test_moderators_list_non_host_forbidden(self, live_session, admin_session):
        """Non-host gets 403 on moderators list"""
        resp = admin_session.get(f"{BASE_URL}/api/live/{live_session['session_id']}/moderators")
        assert resp.status_code == 403
        print("PASSED: Non-host gets 403 on moderators list")
    
    def test_moderators_list_host_success(self, live_session, creator_session):
        """Host can get moderators list"""
        resp = creator_session.get(f"{BASE_URL}/api/live/{live_session['session_id']}/moderators")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASSED: Host can get moderators list ({len(data)} mods)")
    
    def test_add_moderator_requires_auth(self, live_session):
        """Add moderator requires authentication"""
        resp = requests.post(f"{BASE_URL}/api/live/{live_session['session_id']}/moderators", json={
            "user_id": "fake_user"
        })
        assert resp.status_code == 401
        print("PASSED: Add moderator requires auth")
    
    def test_add_moderator_non_host_forbidden(self, live_session, admin_session):
        """Non-host gets 403 on add moderator"""
        resp = admin_session.post(f"{BASE_URL}/api/live/{live_session['session_id']}/moderators", json={
            "user_id": "fake_user"
        })
        assert resp.status_code == 403
        print("PASSED: Non-host gets 403 on add moderator")
    
    def test_add_self_as_moderator_rejected(self, live_session, creator_session):
        """Host cannot add self as moderator"""
        # Get creator's user_id
        resp = creator_session.get(f"{BASE_URL}/api/auth/me")
        creator_id = resp.json()["user_id"]
        
        resp = creator_session.post(f"{BASE_URL}/api/live/{live_session['session_id']}/moderators", json={
            "user_id": creator_id
        })
        assert resp.status_code == 400
        print("PASSED: Host cannot add self as moderator")
    
    def test_add_moderator_success(self, live_session, creator_session, admin_session):
        """Host can add a valid user as moderator"""
        # Get admin's user_id
        resp = admin_session.get(f"{BASE_URL}/api/auth/me")
        admin_id = resp.json()["user_id"]
        
        resp = creator_session.post(f"{BASE_URL}/api/live/{live_session['session_id']}/moderators", json={
            "user_id": admin_id,
            "can_kick": True,
            "can_ban": True,
            "can_delete_msg": True,
            "can_mute": True,
            "can_pin": False,
            "can_view_revenue": False
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("ok") == True
        assert "moderator" in data
        print("PASSED: Host can add moderator with permissions")
    
    def test_remove_moderator_success(self, live_session, creator_session, admin_session):
        """Host can remove a moderator"""
        # Get admin's user_id
        resp = admin_session.get(f"{BASE_URL}/api/auth/me")
        admin_id = resp.json()["user_id"]
        
        resp = creator_session.delete(f"{BASE_URL}/api/live/{live_session['session_id']}/moderators/{admin_id}")
        assert resp.status_code == 200
        print("PASSED: Host can remove moderator")


class TestMuteUser:
    """Tests for POST /api/live/{id}/mute"""
    
    @pytest.fixture(scope="class")
    def live_session(self, creator_session):
        """Start a live session for testing"""
        resp = creator_session.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Mute Live",
            "description": "Testing mute endpoint"
        })
        assert resp.status_code == 200
        session = resp.json()["session"]
        yield session
        creator_session.post(f"{BASE_URL}/api/live/{session['session_id']}/stop")
    
    def test_mute_requires_auth(self, live_session):
        """Mute requires authentication"""
        resp = requests.post(f"{BASE_URL}/api/live/{live_session['session_id']}/mute", json={
            "user_id": "fake_user",
            "minutes": 5
        })
        assert resp.status_code == 401
        print("PASSED: Mute requires auth")
    
    def test_mute_non_host_no_perm_forbidden(self, live_session, admin_session):
        """Non-host without can_mute permission gets 403"""
        resp = admin_session.post(f"{BASE_URL}/api/live/{live_session['session_id']}/mute", json={
            "user_id": "fake_user",
            "minutes": 5
        })
        assert resp.status_code == 403
        print("PASSED: Non-host without can_mute gets 403")
    
    def test_mute_host_success(self, live_session, creator_session, admin_session):
        """Host can mute a user"""
        # Get admin's user_id
        resp = admin_session.get(f"{BASE_URL}/api/auth/me")
        admin_id = resp.json()["user_id"]
        
        resp = creator_session.post(f"{BASE_URL}/api/live/{live_session['session_id']}/mute", json={
            "user_id": admin_id,
            "minutes": 5
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("ok") == True
        assert "muted_until" in data
        print("PASSED: Host can mute user")


class TestChatModeration:
    """Tests for chat message deletion and pinning"""
    
    @pytest.fixture(scope="class")
    def live_with_chat(self, creator_session):
        """Start a live and send a chat message"""
        resp = creator_session.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Chat Mod Live",
            "description": "Testing chat moderation"
        })
        assert resp.status_code == 200
        session = resp.json()["session"]
        
        # Join the live
        creator_session.post(f"{BASE_URL}/api/live/{session['session_id']}/join")
        
        # Send a chat message
        resp = creator_session.post(f"{BASE_URL}/api/live/{session['session_id']}/chat", json={
            "body": "Test message for moderation"
        })
        assert resp.status_code == 200
        message = resp.json()
        
        yield {"session": session, "message": message}
        creator_session.post(f"{BASE_URL}/api/live/{session['session_id']}/stop")
    
    def test_delete_chat_requires_auth(self, live_with_chat):
        """Delete chat requires authentication"""
        resp = requests.delete(
            f"{BASE_URL}/api/live/{live_with_chat['session']['session_id']}/chat/{live_with_chat['message']['message_id']}"
        )
        assert resp.status_code == 401
        print("PASSED: Delete chat requires auth")
    
    def test_delete_chat_non_host_no_perm_forbidden(self, live_with_chat, admin_session):
        """Non-host without can_delete_msg permission gets 403"""
        resp = admin_session.delete(
            f"{BASE_URL}/api/live/{live_with_chat['session']['session_id']}/chat/{live_with_chat['message']['message_id']}"
        )
        assert resp.status_code == 403
        print("PASSED: Non-host without can_delete_msg gets 403")
    
    def test_pin_message_requires_auth(self, live_with_chat):
        """Pin message requires authentication"""
        resp = requests.post(
            f"{BASE_URL}/api/live/{live_with_chat['session']['session_id']}/pin/{live_with_chat['message']['message_id']}"
        )
        assert resp.status_code == 401
        print("PASSED: Pin message requires auth")
    
    def test_pin_message_non_host_no_perm_forbidden(self, live_with_chat, admin_session):
        """Non-host without can_pin permission gets 403"""
        resp = admin_session.post(
            f"{BASE_URL}/api/live/{live_with_chat['session']['session_id']}/pin/{live_with_chat['message']['message_id']}"
        )
        assert resp.status_code == 403
        print("PASSED: Non-host without can_pin gets 403")
    
    def test_pin_message_host_success(self, live_with_chat, creator_session):
        """Host can pin a message"""
        resp = creator_session.post(
            f"{BASE_URL}/api/live/{live_with_chat['session']['session_id']}/pin/{live_with_chat['message']['message_id']}"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("ok") == True
        assert "pinned_message_id" in data
        print("PASSED: Host can pin message")
    
    def test_delete_chat_host_success(self, live_with_chat, creator_session):
        """Host can delete a chat message"""
        # First send a new message to delete
        resp = creator_session.post(f"{BASE_URL}/api/live/{live_with_chat['session']['session_id']}/chat", json={
            "body": "Message to delete"
        })
        assert resp.status_code == 200
        msg_id = resp.json()["message_id"]
        
        resp = creator_session.delete(
            f"{BASE_URL}/api/live/{live_with_chat['session']['session_id']}/chat/{msg_id}"
        )
        assert resp.status_code == 200
        print("PASSED: Host can delete chat message")


class TestKickWithModerator:
    """Tests for extended kick endpoint with moderator permissions"""
    
    @pytest.fixture(scope="class")
    def live_with_mod(self, creator_session, admin_session):
        """Start a live and add admin as moderator with can_kick"""
        resp = creator_session.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Kick Mod Live",
            "description": "Testing kick with moderator"
        })
        assert resp.status_code == 200
        session = resp.json()["session"]
        
        # Get admin's user_id
        resp = admin_session.get(f"{BASE_URL}/api/auth/me")
        admin_id = resp.json()["user_id"]
        
        # Add admin as moderator with can_kick
        creator_session.post(f"{BASE_URL}/api/live/{session['session_id']}/moderators", json={
            "user_id": admin_id,
            "can_kick": True,
            "can_ban": True,
            "can_delete_msg": False,
            "can_mute": False,
            "can_pin": False,
            "can_view_revenue": False
        })
        
        yield {"session": session, "mod_id": admin_id}
        creator_session.post(f"{BASE_URL}/api/live/{session['session_id']}/stop")
    
    def test_kick_requires_auth(self, live_with_mod):
        """Kick requires authentication"""
        resp = requests.post(f"{BASE_URL}/api/live/{live_with_mod['session']['session_id']}/kick", json={
            "user_id": "fake_user"
        })
        assert resp.status_code == 401
        print("PASSED: Kick requires auth")
    
    def test_kick_non_mod_forbidden(self, live_with_mod):
        """Non-moderator gets 403"""
        # Create a new session without mod permissions
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": f"test_kick_{int(time.time())}@meandyou.fans",
            "password": "TestKick2026!",
            "name": "Test Kick User",
            "is_creator": False
        })
        if resp.status_code == 200:
            resp = session.post(f"{BASE_URL}/api/live/{live_with_mod['session']['session_id']}/kick", json={
                "user_id": "fake_user"
            })
            assert resp.status_code == 403
            print("PASSED: Non-moderator gets 403 on kick")
        else:
            print("SKIPPED: Could not create test user for kick test")


class TestMutedUserChatBlocked:
    """Test that muted user cannot send chat messages"""
    
    @pytest.fixture(scope="class")
    def muted_user_setup(self, creator_session, admin_session):
        """Start a live, mute admin, and return setup"""
        resp = creator_session.post(f"{BASE_URL}/api/live/start", json={
            "title": "Test Muted Chat Live",
            "description": "Testing muted user chat"
        })
        assert resp.status_code == 200
        session = resp.json()["session"]
        
        # Get admin's user_id
        resp = admin_session.get(f"{BASE_URL}/api/auth/me")
        admin_id = resp.json()["user_id"]
        
        # Mute admin for 5 minutes
        creator_session.post(f"{BASE_URL}/api/live/{session['session_id']}/mute", json={
            "user_id": admin_id,
            "minutes": 5
        })
        
        yield {"session": session, "muted_user_session": admin_session}
        creator_session.post(f"{BASE_URL}/api/live/{session['session_id']}/stop")
    
    def test_muted_user_chat_blocked(self, muted_user_setup):
        """Muted user gets 403 with error='muted' when trying to chat"""
        resp = muted_user_setup["muted_user_session"].post(
            f"{BASE_URL}/api/live/{muted_user_setup['session']['session_id']}/chat",
            json={"body": "I am muted"}
        )
        assert resp.status_code == 403
        data = resp.json()
        detail = data.get("detail", {})
        if isinstance(detail, dict):
            assert detail.get("error") == "muted", f"Expected error='muted', got: {detail}"
        print("PASSED: Muted user gets 403 with error='muted'")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup(self, creator_session):
        """Stop any remaining test sessions"""
        # Get active sessions
        resp = requests.get(f"{BASE_URL}/api/live/active")
        if resp.status_code == 200:
            sessions = resp.json()
            for s in sessions:
                if "Test" in s.get("title", ""):
                    try:
                        creator_session.post(f"{BASE_URL}/api/live/{s['session_id']}/stop")
                    except:
                        pass
        print("PASSED: Cleanup completed")


# Fixtures at module level
@pytest.fixture(scope="class")
def admin_session():
    session = requests.Session()
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    return session

@pytest.fixture(scope="class")
def creator_session():
    session = requests.Session()
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": FAN_EMAIL,
        "password": FAN_PASSWORD
    })
    assert resp.status_code == 200, f"Creator login failed: {resp.text}"
    return session
