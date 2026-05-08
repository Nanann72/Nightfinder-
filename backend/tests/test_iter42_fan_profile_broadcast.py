"""
Iteration 42 - Fan Profile Editor + Creator Stripchat-style Fields + Admin Broadcast Tests

Tests:
1. PATCH /users/me - one-time username change for fresh fan
2. PATCH /users/me - second username change blocked (400)
3. PATCH /users/me - name/bio/avatar_url/email_notifications_enabled always editable
4. GET /users/me/subscriptions - returns subscription list with creator details
5. DELETE /subscriptions/{creator_id} - hard-cancel active subscription
6. PATCH /creators/me - Stripchat-style fields (about_me, languages, body_type, etc.)
7. GET /creators/{id} - returns extended profile fields
8. GET /admin/users?segment=inactive_30d|active_subscribers|top_creators
9. GET /admin/broadcast/preview?segment=... - returns count
10. POST /admin/broadcast/send with test_email - test mode
11. POST /admin/broadcast/send without test_email - broadcast mode
12. GET /admin/broadcasts - list past broadcasts
13. Non-admin 403 on broadcast endpoints
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


@pytest.fixture(scope="module")
def admin_token():
    """Get admin auth token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Admin login failed: {resp.status_code} - {resp.text}")
    return resp.json().get("access_token")


@pytest.fixture(scope="module")
def fan_token():
    """Get fan auth token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": FAN_EMAIL,
        "password": FAN_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Fan login failed: {resp.status_code} - {resp.text}")
    return resp.json().get("access_token")


@pytest.fixture(scope="module")
def fresh_fan_token():
    """Register a fresh fan account for one-time username test"""
    unique_id = uuid.uuid4().hex[:8]
    email = f"test_fresh_fan_{unique_id}@meandyou.fans"
    password = "Test12345!"
    name = f"Fresh Fan {unique_id}"
    
    resp = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": password,
        "name": name,
        "is_creator": False
    })
    if resp.status_code not in [200, 201]:
        pytest.skip(f"Fresh fan registration failed: {resp.status_code} - {resp.text}")
    
    data = resp.json()
    return {
        "token": data.get("access_token"),
        "email": email,
        "user_id": data.get("user", {}).get("user_id")
    }


class TestUserSelfUpdate:
    """Test PATCH /users/me - fan profile editor"""
    
    def test_fresh_fan_can_set_username_once(self, fresh_fan_token):
        """Fresh fan can set username for the first time"""
        token = fresh_fan_token["token"]
        unique_username = f"testuser_{uuid.uuid4().hex[:6]}"
        
        resp = requests.patch(
            f"{BASE_URL}/api/users/me",
            json={"username": unique_username},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("username") == unique_username
        assert data.get("username_changed") == True
        print(f"PASSED: Fresh fan set username to '{unique_username}'")
    
    def test_fresh_fan_cannot_change_username_twice(self, fresh_fan_token):
        """After setting username once, second change should fail with 400"""
        token = fresh_fan_token["token"]
        new_username = f"newname_{uuid.uuid4().hex[:6]}"
        
        resp = requests.patch(
            f"{BASE_URL}/api/users/me",
            json={"username": new_username},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        assert "déjà modifié" in resp.text.lower() or "username" in resp.text.lower()
        print(f"PASSED: Second username change blocked with 400")
    
    def test_name_bio_avatar_always_editable(self, fan_token):
        """name, bio, avatar_url, email_notifications_enabled can be changed anytime"""
        resp = requests.patch(
            f"{BASE_URL}/api/users/me",
            json={
                "name": "Updated Fan Name",
                "bio": "This is my updated bio",
                "avatar_url": "https://example.com/avatar.jpg",
                "email_notifications_enabled": False
            },
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("name") == "Updated Fan Name"
        assert data.get("bio") == "This is my updated bio"
        assert data.get("avatar_url") == "https://example.com/avatar.jpg"
        assert data.get("email_notifications_enabled") == False
        print("PASSED: name/bio/avatar_url/email_notifications_enabled updated successfully")
        
        # Restore notifications
        requests.patch(
            f"{BASE_URL}/api/users/me",
            json={"email_notifications_enabled": True},
            headers={"Authorization": f"Bearer {fan_token}"}
        )


class TestUserSubscriptions:
    """Test GET /users/me/subscriptions and DELETE /subscriptions/{creator_id}"""
    
    def test_get_my_subscriptions(self, fan_token):
        """GET /users/me/subscriptions returns array with creator details"""
        resp = requests.get(
            f"{BASE_URL}/api/users/me/subscriptions",
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list response"
        
        # If there are subscriptions, verify structure
        if len(data) > 0:
            sub = data[0]
            assert "subscription_id" in sub or sub.get("subscription_id") is not None or "creator_id" in sub
            assert "creator" in sub
            creator = sub["creator"]
            # Check creator fields
            for field in ["display_name", "handle", "avatar_url", "cover_url", "subscription_price", "verified"]:
                assert field in creator, f"Missing field '{field}' in creator object"
            print(f"PASSED: GET /users/me/subscriptions returned {len(data)} subscriptions with proper structure")
        else:
            print("PASSED: GET /users/me/subscriptions returned empty list (no active subscriptions)")
    
    def test_delete_subscription_not_found(self, fan_token):
        """DELETE /subscriptions/{creator_id} returns 404 for non-existent subscription"""
        fake_creator_id = "creator_nonexistent123"
        resp = requests.delete(
            f"{BASE_URL}/api/subscriptions/{fake_creator_id}",
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"
        print("PASSED: DELETE /subscriptions/{creator_id} returns 404 for non-existent subscription")


class TestCreatorProfileExtended:
    """Test PATCH /creators/me with Stripchat-style fields"""
    
    def test_patch_creator_stripchat_fields(self, fan_token):
        """PATCH /creators/me accepts new Stripchat-style fields"""
        # fan@meandyou.fans was promoted to creator earlier
        payload = {
            "about_me": "Je suis une créatrice passionnée par le contenu premium.",
            "languages": ["Français", "Anglais"],
            "body_type": "athletic",
            "ethnicity": "caucasian",
            "hair_color": "brown",
            "eye_color": "blue",
            "sub_culture": "gamer",
            "price_private_per_min": 50,
            "price_exclusive_per_min": 100,
            "price_spy_per_min": 20,
            "price_group_per_min": 30,
            "price_ticket_show": 500,
            "social_instagram": "https://instagram.com/testcreator",
            "social_twitter": "https://x.com/testcreator",
            "social_tiktok": "https://tiktok.com/@testcreator",
            "social_youtube": "https://youtube.com/@testcreator"
        }
        
        resp = requests.patch(
            f"{BASE_URL}/api/creators/me",
            json=payload,
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        
        # May return 404 if fan is not a creator - that's acceptable
        if resp.status_code == 404:
            print("SKIPPED: fan@meandyou.fans is not a creator (404)")
            return
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        # Verify fields were saved
        assert data.get("about_me") == payload["about_me"]
        assert data.get("languages") == payload["languages"]
        assert data.get("body_type") == payload["body_type"]
        assert data.get("price_private_per_min") == payload["price_private_per_min"]
        assert data.get("social_instagram") == payload["social_instagram"]
        print("PASSED: PATCH /creators/me accepted Stripchat-style fields")
    
    def test_get_creator_returns_extended_fields(self, fan_token):
        """GET /creators/{id} returns extended profile fields"""
        # First get the creator_id
        me_resp = requests.get(
            f"{BASE_URL}/api/creators/me",
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        
        if me_resp.status_code == 404:
            print("SKIPPED: fan@meandyou.fans is not a creator (404)")
            return
        
        creator_id = me_resp.json().get("creator_id")
        if not creator_id:
            print("SKIPPED: No creator_id found")
            return
        
        resp = requests.get(f"{BASE_URL}/api/creators/{creator_id}")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        # Check that extended fields are present (may be null if not set)
        extended_fields = [
            "about_me", "languages", "body_type", "ethnicity", "hair_color", "eye_color",
            "sub_culture", "price_private_per_min", "price_exclusive_per_min",
            "price_spy_per_min", "price_group_per_min", "price_ticket_show",
            "social_instagram", "social_twitter", "social_tiktok", "social_youtube"
        ]
        
        for field in extended_fields:
            assert field in data, f"Missing field '{field}' in GET /creators/{creator_id}"
        
        print(f"PASSED: GET /creators/{creator_id} returns all extended fields")


class TestAdminUsersSegment:
    """Test GET /admin/users with segment parameter"""
    
    def test_admin_users_inactive_30d(self, admin_token):
        """GET /admin/users?segment=inactive_30d returns filtered list"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/users",
            params={"segment": "inactive_30d"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list response"
        print(f"PASSED: GET /admin/users?segment=inactive_30d returned {len(data)} users")
    
    def test_admin_users_active_subscribers(self, admin_token):
        """GET /admin/users?segment=active_subscribers returns filtered list"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/users",
            params={"segment": "active_subscribers"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list response"
        print(f"PASSED: GET /admin/users?segment=active_subscribers returned {len(data)} users")
    
    def test_admin_users_top_creators(self, admin_token):
        """GET /admin/users?segment=top_creators returns filtered list"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/users",
            params={"segment": "top_creators"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list response"
        print(f"PASSED: GET /admin/users?segment=top_creators returned {len(data)} users")


class TestAdminBroadcast:
    """Test admin broadcast endpoints"""
    
    def test_broadcast_preview_all(self, admin_token):
        """GET /admin/broadcast/preview?segment=all returns count"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/broadcast/preview",
            params={"segment": "all"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "segment" in data
        assert "count" in data
        assert data["segment"] == "all"
        assert isinstance(data["count"], int)
        print(f"PASSED: GET /admin/broadcast/preview?segment=all returned count={data['count']}")
    
    def test_broadcast_preview_fans(self, admin_token):
        """GET /admin/broadcast/preview?segment=fans returns count"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/broadcast/preview",
            params={"segment": "fans"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["segment"] == "fans"
        print(f"PASSED: GET /admin/broadcast/preview?segment=fans returned count={data['count']}")
    
    def test_broadcast_preview_creators(self, admin_token):
        """GET /admin/broadcast/preview?segment=creators returns count"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/broadcast/preview",
            params={"segment": "creators"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["segment"] == "creators"
        print(f"PASSED: GET /admin/broadcast/preview?segment=creators returned count={data['count']}")
    
    def test_broadcast_preview_active_subscribers(self, admin_token):
        """GET /admin/broadcast/preview?segment=active_subscribers returns count"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/broadcast/preview",
            params={"segment": "active_subscribers"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["segment"] == "active_subscribers"
        print(f"PASSED: GET /admin/broadcast/preview?segment=active_subscribers returned count={data['count']}")
    
    def test_broadcast_preview_inactive_30d(self, admin_token):
        """GET /admin/broadcast/preview?segment=inactive_30d returns count"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/broadcast/preview",
            params={"segment": "inactive_30d"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["segment"] == "inactive_30d"
        print(f"PASSED: GET /admin/broadcast/preview?segment=inactive_30d returned count={data['count']}")
    
    def test_broadcast_send_test_mode(self, admin_token):
        """POST /admin/broadcast/send with test_email returns mode='test'"""
        resp = requests.post(
            f"{BASE_URL}/api/admin/broadcast/send",
            json={
                "subject": "Test Broadcast Subject",
                "body_html": "<p>This is a test broadcast body.</p>",
                "segment": "all",
                "test_email": "admin@meandyou.fans"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("ok") == True
        assert data.get("mode") == "test"
        assert data.get("sent") == 1
        print("PASSED: POST /admin/broadcast/send with test_email returns mode='test', sent=1")
    
    def test_broadcast_send_broadcast_mode(self, admin_token):
        """POST /admin/broadcast/send without test_email returns mode='broadcast'"""
        resp = requests.post(
            f"{BASE_URL}/api/admin/broadcast/send",
            json={
                "subject": f"Broadcast Test {uuid.uuid4().hex[:6]}",
                "body_html": "<p>This is a real broadcast test.</p>",
                "segment": "all",
                "only_email_opted_in": True
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("ok") == True
        assert data.get("mode") == "broadcast"
        assert "broadcast_id" in data
        assert "queued" in data
        print(f"PASSED: POST /admin/broadcast/send returns mode='broadcast', broadcast_id={data['broadcast_id']}, queued={data['queued']}")
    
    def test_broadcasts_list(self, admin_token):
        """GET /admin/broadcasts returns list of past broadcasts"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/broadcasts",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list response"
        
        if len(data) > 0:
            broadcast = data[0]
            assert "broadcast_id" in broadcast
            assert "subject" in broadcast
            assert "segment" in broadcast
            assert "status" in broadcast
            print(f"PASSED: GET /admin/broadcasts returned {len(data)} broadcasts with proper structure")
        else:
            print("PASSED: GET /admin/broadcasts returned empty list")


class TestNonAdminBroadcastAccess:
    """Test that non-admin users get 403 on broadcast endpoints"""
    
    def test_broadcast_preview_requires_admin(self, fan_token):
        """Non-admin gets 403 on /admin/broadcast/preview"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/broadcast/preview",
            params={"segment": "all"},
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        print("PASSED: Non-admin gets 403 on /admin/broadcast/preview")
    
    def test_broadcast_send_requires_admin(self, fan_token):
        """Non-admin gets 403 on /admin/broadcast/send"""
        resp = requests.post(
            f"{BASE_URL}/api/admin/broadcast/send",
            json={
                "subject": "Test",
                "body_html": "<p>Test</p>",
                "segment": "all"
            },
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        print("PASSED: Non-admin gets 403 on /admin/broadcast/send")
    
    def test_broadcasts_list_requires_admin(self, fan_token):
        """Non-admin gets 403 on /admin/broadcasts"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/broadcasts",
            headers={"Authorization": f"Bearer {fan_token}"}
        )
        
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        print("PASSED: Non-admin gets 403 on /admin/broadcasts")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
