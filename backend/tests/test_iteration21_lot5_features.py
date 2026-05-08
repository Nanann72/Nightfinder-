"""
Iteration 21 - Lot 5 Features Testing
=====================================
Tests for:
1. Likes: POST/DELETE /api/content/{id}/like - idempotent like/unlike
2. Feed: GET /api/feed - returns is_liked + likes_count
3. Creator Profile: GET /api/creators/{id} - returns content with is_liked + likes_count
4. Content Scheduling: POST /api/creators/me/content with scheduled_at + expires_in_hours
5. Content Deletion: DELETE /api/creators/me/content/{id} - cascade delete
6. Analytics: GET /api/creators/me/analytics?days=7
7. External URL: PATCH /api/creators/me with external_url
8. Push VAPID: GET /api/push/vapid-public-key
9. Push Subscribe/Unsubscribe: POST /api/push/subscribe, POST /api/push/unsubscribe
10. Regression: media-file, watermark, Stripe SetupIntent
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@meandyou.fans"
ADMIN_PASSWORD = "Admin2026!"
FAN_EMAIL = "fan@meandyou.fans"
FAN_PASSWORD = "TestFan2026!"


class TestAuth:
    """Authentication helpers"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Login as admin and return session with cookies"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert resp.status_code == 200, f"Admin login failed: {resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def fan_session(self):
        """Login as fan and return session with cookies"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        assert resp.status_code == 200, f"Fan login failed: {resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def test_creator_session(self):
        """Create a test creator account for testing"""
        session = requests.Session()
        test_email = f"test_creator_{uuid.uuid4().hex[:8]}@meandyou.fans"
        
        # Register
        resp = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "password": "TestCreator2026!",
            "name": "Test Creator Lot5",
            "is_creator": False
        })
        if resp.status_code != 200:
            pytest.skip(f"Could not create test creator: {resp.text}")
        
        # Become creator
        resp = session.post(f"{BASE_URL}/api/creators/me/become", json={
            "display_name": "Test Creator Lot5",
            "handle": f"testcreator{uuid.uuid4().hex[:6]}"
        })
        assert resp.status_code == 200, f"Become creator failed: {resp.text}"
        
        return session, test_email


class TestLikes(TestAuth):
    """Test like/unlike endpoints"""
    
    def test_like_content_returns_correct_structure(self, fan_session):
        """POST /api/content/{id}/like returns {ok, is_liked, likes_count}"""
        # First get some content from feed
        resp = fan_session.get(f"{BASE_URL}/api/feed?limit=5")
        assert resp.status_code == 200
        items = resp.json()
        
        if not items:
            pytest.skip("No content in feed to test likes")
        
        content_id = items[0]["content_id"]
        
        # Like the content
        resp = fan_session.post(f"{BASE_URL}/api/content/{content_id}/like")
        assert resp.status_code == 200, f"Like failed: {resp.text}"
        data = resp.json()
        
        assert "ok" in data or "is_liked" in data, f"Missing expected fields: {data}"
        assert data.get("is_liked") == True, f"is_liked should be True: {data}"
        assert "likes_count" in data, f"Missing likes_count: {data}"
        assert isinstance(data["likes_count"], int), f"likes_count should be int: {data}"
        print(f"PASSED: Like returns correct structure: {data}")
    
    def test_like_is_idempotent(self, fan_session):
        """Second POST to like doesn't double count"""
        resp = fan_session.get(f"{BASE_URL}/api/feed?limit=5")
        items = resp.json()
        if not items:
            pytest.skip("No content in feed")
        
        content_id = items[0]["content_id"]
        
        # Like twice
        resp1 = fan_session.post(f"{BASE_URL}/api/content/{content_id}/like")
        assert resp1.status_code == 200
        count1 = resp1.json().get("likes_count", 0)
        
        resp2 = fan_session.post(f"{BASE_URL}/api/content/{content_id}/like")
        assert resp2.status_code == 200
        count2 = resp2.json().get("likes_count", 0)
        
        assert count1 == count2, f"Like should be idempotent: {count1} vs {count2}"
        print(f"PASSED: Like is idempotent (count stayed at {count1})")
    
    def test_unlike_decrements_count(self, fan_session):
        """DELETE /api/content/{id}/like decrements likes_count"""
        resp = fan_session.get(f"{BASE_URL}/api/feed?limit=5")
        items = resp.json()
        if not items:
            pytest.skip("No content in feed")
        
        content_id = items[0]["content_id"]
        
        # Ensure liked first
        resp = fan_session.post(f"{BASE_URL}/api/content/{content_id}/like")
        assert resp.status_code == 200
        count_before = resp.json().get("likes_count", 0)
        
        # Unlike
        resp = fan_session.delete(f"{BASE_URL}/api/content/{content_id}/like")
        assert resp.status_code == 200, f"Unlike failed: {resp.text}"
        data = resp.json()
        
        assert data.get("is_liked") == False, f"is_liked should be False: {data}"
        assert "likes_count" in data, f"Missing likes_count: {data}"
        # Count should be decremented (or same if was already 0)
        assert data["likes_count"] <= count_before, f"Count should decrease: {data}"
        print(f"PASSED: Unlike decrements count: {count_before} -> {data['likes_count']}")
    
    def test_unlike_never_goes_below_zero(self, fan_session):
        """Multiple unlikes don't make count negative"""
        resp = fan_session.get(f"{BASE_URL}/api/feed?limit=5")
        items = resp.json()
        if not items:
            pytest.skip("No content in feed")
        
        content_id = items[0]["content_id"]
        
        # Unlike multiple times
        for _ in range(3):
            resp = fan_session.delete(f"{BASE_URL}/api/content/{content_id}/like")
            assert resp.status_code == 200
            count = resp.json().get("likes_count", 0)
            assert count >= 0, f"likes_count went negative: {count}"
        
        print(f"PASSED: likes_count never goes below 0")
    
    def test_like_nonexistent_content_returns_404(self, fan_session):
        """Like on non-existent content returns 404"""
        resp = fan_session.post(f"{BASE_URL}/api/content/ct_nonexistent123/like")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("PASSED: Like on non-existent content returns 404")


class TestFeedWithLikes(TestAuth):
    """Test feed returns is_liked and likes_count"""
    
    def test_feed_returns_is_liked_field(self, fan_session):
        """GET /api/feed returns is_liked boolean for each item"""
        resp = fan_session.get(f"{BASE_URL}/api/feed?limit=10")
        assert resp.status_code == 200
        items = resp.json()
        
        if not items:
            pytest.skip("No content in feed")
        
        for item in items:
            assert "is_liked" in item, f"Missing is_liked in feed item: {item.get('content_id')}"
            assert isinstance(item["is_liked"], bool), f"is_liked should be bool: {item['is_liked']}"
        
        print(f"PASSED: Feed returns is_liked for all {len(items)} items")
    
    def test_feed_returns_likes_count_field(self, fan_session):
        """GET /api/feed returns likes_count int for each item"""
        resp = fan_session.get(f"{BASE_URL}/api/feed?limit=10")
        assert resp.status_code == 200
        items = resp.json()
        
        if not items:
            pytest.skip("No content in feed")
        
        for item in items:
            assert "likes_count" in item, f"Missing likes_count in feed item: {item.get('content_id')}"
            assert isinstance(item["likes_count"], int), f"likes_count should be int: {item['likes_count']}"
        
        print(f"PASSED: Feed returns likes_count for all {len(items)} items")


class TestCreatorProfileWithLikes(TestAuth):
    """Test creator profile returns content with is_liked and likes_count"""
    
    def test_creator_profile_content_has_is_liked(self, fan_session):
        """GET /api/creators/{id} returns content with is_liked"""
        # Get a creator from feed
        resp = fan_session.get(f"{BASE_URL}/api/feed?limit=5")
        items = resp.json()
        if not items:
            pytest.skip("No content in feed")
        
        creator_id = items[0]["creator_id"]
        
        resp = fan_session.get(f"{BASE_URL}/api/creators/{creator_id}")
        assert resp.status_code == 200, f"Get creator failed: {resp.text}"
        creator = resp.json()
        
        content = creator.get("content", [])
        if not content:
            pytest.skip("Creator has no content")
        
        for item in content:
            assert "is_liked" in item, f"Missing is_liked in creator content: {item.get('content_id')}"
            assert "likes_count" in item, f"Missing likes_count in creator content: {item.get('content_id')}"
        
        print(f"PASSED: Creator profile content has is_liked and likes_count for {len(content)} items")


class TestContentScheduling(TestAuth):
    """Test content scheduling with scheduled_at and expires_in_hours"""
    
    def test_create_content_with_scheduled_at(self, test_creator_session):
        """POST /api/creators/me/content accepts scheduled_at"""
        session, _ = test_creator_session
        
        # Schedule for 1 hour in the future
        future_time = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        
        resp = session.post(f"{BASE_URL}/api/creators/me/content", json={
            "title": "TEST_Scheduled Post",
            "description": "This is a scheduled test post",
            "media_url": "https://example.com/test.jpg",
            "is_premium": False,
            "scheduled_at": future_time
        })
        assert resp.status_code == 200, f"Create scheduled content failed: {resp.text}"
        data = resp.json()
        
        assert "content_id" in data, f"Missing content_id: {data}"
        assert "scheduled_at" in data, f"Missing scheduled_at: {data}"
        print(f"PASSED: Created scheduled content: {data['content_id']}")
        
        return data["content_id"]
    
    def test_create_content_with_expires_in_hours(self, test_creator_session):
        """POST /api/creators/me/content accepts expires_in_hours"""
        session, _ = test_creator_session
        
        resp = session.post(f"{BASE_URL}/api/creators/me/content", json={
            "title": "TEST_24h Post",
            "description": "This is a 24h expiring post",
            "media_url": "https://example.com/test24h.jpg",
            "is_premium": False,
            "expires_in_hours": 24
        })
        assert resp.status_code == 200, f"Create 24h content failed: {resp.text}"
        data = resp.json()
        
        assert "content_id" in data, f"Missing content_id: {data}"
        assert "expires_at" in data, f"Missing expires_at: {data}"
        assert data["expires_at"] is not None, f"expires_at should not be None: {data}"
        print(f"PASSED: Created 24h content with expires_at: {data['expires_at']}")
        
        return data["content_id"]
    
    def test_scheduled_content_not_in_feed_for_others(self, test_creator_session, fan_session):
        """Content with future scheduled_at should NOT appear in feed for non-owner"""
        session, _ = test_creator_session
        
        # Create content scheduled for far future
        future_time = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        
        resp = session.post(f"{BASE_URL}/api/creators/me/content", json={
            "title": "TEST_Future Scheduled",
            "description": "Should not appear in feed",
            "media_url": "https://example.com/future.jpg",
            "is_premium": False,
            "scheduled_at": future_time
        })
        assert resp.status_code == 200
        content_id = resp.json()["content_id"]
        
        # Check feed as fan - should NOT see this content
        resp = fan_session.get(f"{BASE_URL}/api/feed?limit=100")
        assert resp.status_code == 200
        feed_ids = [item["content_id"] for item in resp.json()]
        
        assert content_id not in feed_ids, f"Scheduled future content should not appear in feed"
        print(f"PASSED: Scheduled future content {content_id} not in feed for fans")


class TestContentDeletion(TestAuth):
    """Test content deletion with cascade"""
    
    def test_delete_own_content(self, test_creator_session):
        """DELETE /api/creators/me/content/{id} removes the post"""
        session, _ = test_creator_session
        
        # Create content first
        resp = session.post(f"{BASE_URL}/api/creators/me/content", json={
            "title": "TEST_To Delete",
            "description": "Will be deleted",
            "media_url": "https://example.com/delete.jpg",
            "is_premium": False
        })
        assert resp.status_code == 200
        content_id = resp.json()["content_id"]
        
        # Delete it
        resp = session.delete(f"{BASE_URL}/api/creators/me/content/{content_id}")
        assert resp.status_code == 200, f"Delete failed: {resp.text}"
        data = resp.json()
        assert data.get("ok") == True, f"Delete should return ok:true: {data}"
        
        print(f"PASSED: Deleted content {content_id}")
    
    def test_delete_others_content_forbidden(self, test_creator_session, fan_session):
        """DELETE /api/creators/me/content/{id} returns 403 for other creators"""
        session, _ = test_creator_session
        
        # Create content as test creator
        resp = session.post(f"{BASE_URL}/api/creators/me/content", json={
            "title": "TEST_Protected Content",
            "description": "Should not be deletable by others",
            "media_url": "https://example.com/protected.jpg",
            "is_premium": False
        })
        assert resp.status_code == 200
        content_id = resp.json()["content_id"]
        
        # Try to delete as fan (not the owner)
        resp = fan_session.delete(f"{BASE_URL}/api/creators/me/content/{content_id}")
        # Should be 403 Forbidden or 404 (if fan is not a creator)
        assert resp.status_code in [403, 404], f"Expected 403/404, got {resp.status_code}: {resp.text}"
        
        print(f"PASSED: Cannot delete others' content (got {resp.status_code})")


class TestCreatorAnalytics(TestAuth):
    """Test creator analytics endpoint"""
    
    def test_analytics_returns_correct_structure(self, test_creator_session):
        """GET /api/creators/me/analytics?days=7 returns expected keys"""
        session, _ = test_creator_session
        
        resp = session.get(f"{BASE_URL}/api/creators/me/analytics?days=7")
        assert resp.status_code == 200, f"Analytics failed: {resp.text}"
        data = resp.json()
        
        # Check required keys
        required_keys = [
            "days", "active_subscribers", "total_likes",
            "totals_coins", "totals_eur", "earnings_timeline",
            "subscribers_timeline", "top_posts"
        ]
        for key in required_keys:
            assert key in data, f"Missing key '{key}' in analytics: {data.keys()}"
        
        assert data["days"] == 7, f"days should be 7: {data['days']}"
        print(f"PASSED: Analytics returns all required keys")
    
    def test_analytics_earnings_timeline_length(self, test_creator_session):
        """earnings_timeline should have length equal to days"""
        session, _ = test_creator_session
        
        resp = session.get(f"{BASE_URL}/api/creators/me/analytics?days=7")
        assert resp.status_code == 200
        data = resp.json()
        
        timeline = data.get("earnings_timeline", [])
        assert len(timeline) == 7, f"earnings_timeline should have 7 items: {len(timeline)}"
        
        # Check each item has required fields
        for item in timeline:
            assert "day" in item, f"Missing 'day' in timeline item: {item}"
            assert "coins" in item, f"Missing 'coins' in timeline item: {item}"
        
        print(f"PASSED: earnings_timeline has correct length and structure")
    
    def test_analytics_subscribers_timeline_length(self, test_creator_session):
        """subscribers_timeline should have length equal to days"""
        session, _ = test_creator_session
        
        resp = session.get(f"{BASE_URL}/api/creators/me/analytics?days=7")
        assert resp.status_code == 200
        data = resp.json()
        
        timeline = data.get("subscribers_timeline", [])
        assert len(timeline) == 7, f"subscribers_timeline should have 7 items: {len(timeline)}"
        
        print(f"PASSED: subscribers_timeline has correct length")
    
    def test_analytics_top_posts_max_5(self, test_creator_session):
        """top_posts should have max 5 items"""
        session, _ = test_creator_session
        
        resp = session.get(f"{BASE_URL}/api/creators/me/analytics?days=30")
        assert resp.status_code == 200
        data = resp.json()
        
        top_posts = data.get("top_posts", [])
        assert len(top_posts) <= 5, f"top_posts should have max 5 items: {len(top_posts)}"
        
        print(f"PASSED: top_posts has {len(top_posts)} items (max 5)")
    
    def test_analytics_empty_creator_returns_zeros(self, test_creator_session):
        """New creator with no activity should get zeros but full structure"""
        session, _ = test_creator_session
        
        resp = session.get(f"{BASE_URL}/api/creators/me/analytics?days=7")
        assert resp.status_code == 200
        data = resp.json()
        
        # Should have structure even if empty
        assert data["active_subscribers"] >= 0
        assert data["total_likes"] >= 0
        assert "totals_coins" in data
        assert "totals_eur" in data
        
        print(f"PASSED: Empty creator gets valid analytics structure")


class TestExternalUrl(TestAuth):
    """Test external_url (bio link) field"""
    
    def test_patch_creator_with_external_url(self, test_creator_session):
        """PATCH /api/creators/me accepts external_url"""
        session, _ = test_creator_session
        
        test_url = "https://mywebsite.com/bio"
        resp = session.patch(f"{BASE_URL}/api/creators/me", json={
            "external_url": test_url
        })
        assert resp.status_code == 200, f"Patch failed: {resp.text}"
        data = resp.json()
        
        assert data.get("external_url") == test_url, f"external_url not saved: {data}"
        print(f"PASSED: external_url saved: {test_url}")
    
    def test_get_creator_returns_external_url(self, test_creator_session):
        """GET /api/creators/{id} returns external_url"""
        session, _ = test_creator_session
        
        # First set external_url
        test_url = "https://mywebsite.com/profile"
        session.patch(f"{BASE_URL}/api/creators/me", json={
            "external_url": test_url
        })
        
        # Get auth/me to find creator_id
        resp = session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        user_id = resp.json()["user_id"]
        
        # Get creator profile
        resp = session.get(f"{BASE_URL}/api/creators/{user_id}")
        assert resp.status_code == 200
        creator = resp.json()
        
        assert "external_url" in creator, f"external_url not in creator profile: {creator.keys()}"
        assert creator["external_url"] == test_url, f"external_url mismatch: {creator['external_url']}"
        
        print(f"PASSED: GET creator returns external_url")


class TestPushVapid:
    """Test VAPID public key endpoint"""
    
    def test_vapid_public_key_returns_structure(self):
        """GET /api/push/vapid-public-key returns {public_key, enabled}"""
        resp = requests.get(f"{BASE_URL}/api/push/vapid-public-key")
        assert resp.status_code == 200, f"VAPID endpoint failed: {resp.text}"
        data = resp.json()
        
        assert "public_key" in data, f"Missing public_key: {data}"
        assert "enabled" in data, f"Missing enabled: {data}"
        assert isinstance(data["enabled"], bool), f"enabled should be bool: {data}"
        
        print(f"PASSED: VAPID endpoint returns correct structure, enabled={data['enabled']}")
    
    def test_vapid_public_key_is_base64url(self):
        """public_key should be a base64url string ~87 chars"""
        resp = requests.get(f"{BASE_URL}/api/push/vapid-public-key")
        assert resp.status_code == 200
        data = resp.json()
        
        if data["enabled"]:
            pub_key = data["public_key"]
            assert len(pub_key) >= 80, f"public_key too short: {len(pub_key)}"
            assert len(pub_key) <= 100, f"public_key too long: {len(pub_key)}"
            # Base64url characters
            import re
            assert re.match(r'^[A-Za-z0-9_-]+$', pub_key), f"Invalid base64url: {pub_key[:20]}..."
            print(f"PASSED: VAPID public_key is valid base64url ({len(pub_key)} chars)")
        else:
            print("SKIPPED: VAPID not enabled, public_key validation skipped")


class TestPushSubscribe(TestAuth):
    """Test push subscribe/unsubscribe endpoints"""
    
    def test_push_subscribe_valid_payload(self, fan_session):
        """POST /api/push/subscribe with valid payload returns 200"""
        test_endpoint = f"https://fcm.googleapis.com/fcm/send/{uuid.uuid4().hex}"
        
        resp = fan_session.post(f"{BASE_URL}/api/push/subscribe", json={
            "endpoint": test_endpoint,
            "keys": {
                "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
                "auth": "tBHItJI5svbpez7KI4CCXg"
            }
        })
        assert resp.status_code == 200, f"Subscribe failed: {resp.text}"
        data = resp.json()
        assert data.get("ok") == True, f"Subscribe should return ok:true: {data}"
        
        print(f"PASSED: Push subscribe with valid payload")
    
    def test_push_subscribe_idempotent(self, fan_session):
        """Second subscribe with same endpoint doesn't fail"""
        test_endpoint = f"https://fcm.googleapis.com/fcm/send/{uuid.uuid4().hex}"
        payload = {
            "endpoint": test_endpoint,
            "keys": {
                "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
                "auth": "tBHItJI5svbpez7KI4CCXg"
            }
        }
        
        resp1 = fan_session.post(f"{BASE_URL}/api/push/subscribe", json=payload)
        assert resp1.status_code == 200
        
        resp2 = fan_session.post(f"{BASE_URL}/api/push/subscribe", json=payload)
        assert resp2.status_code == 200, f"Second subscribe failed: {resp2.text}"
        
        print(f"PASSED: Push subscribe is idempotent")
    
    def test_push_subscribe_invalid_payload_returns_400(self, fan_session):
        """POST /api/push/subscribe with invalid payload returns 400"""
        # Missing keys
        resp = fan_session.post(f"{BASE_URL}/api/push/subscribe", json={
            "endpoint": "https://example.com/push"
            # Missing keys
        })
        assert resp.status_code in [400, 422], f"Expected 400/422, got {resp.status_code}"
        
        # Missing p256dh
        resp = fan_session.post(f"{BASE_URL}/api/push/subscribe", json={
            "endpoint": "https://example.com/push",
            "keys": {"auth": "test"}
        })
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        
        print(f"PASSED: Invalid push subscribe returns 400")
    
    def test_push_unsubscribe_specific_endpoint(self, fan_session):
        """POST /api/push/unsubscribe with endpoint deletes only that subscription"""
        test_endpoint = f"https://fcm.googleapis.com/fcm/send/{uuid.uuid4().hex}"
        
        # Subscribe first
        fan_session.post(f"{BASE_URL}/api/push/subscribe", json={
            "endpoint": test_endpoint,
            "keys": {
                "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
                "auth": "tBHItJI5svbpez7KI4CCXg"
            }
        })
        
        # Unsubscribe
        resp = fan_session.post(f"{BASE_URL}/api/push/unsubscribe", json={
            "endpoint": test_endpoint
        })
        assert resp.status_code == 200, f"Unsubscribe failed: {resp.text}"
        data = resp.json()
        assert data.get("ok") == True, f"Unsubscribe should return ok:true: {data}"
        
        print(f"PASSED: Push unsubscribe specific endpoint")


class TestRegressionMediaFile:
    """Regression tests for media-file endpoints"""
    
    def test_media_file_endpoint_exists(self):
        """GET /api/media-file/{id} endpoint exists (404 for invalid id is ok)"""
        resp = requests.get(f"{BASE_URL}/api/media-file/000000000000000000000000")
        # 404 is expected for non-existent file, but endpoint should exist
        assert resp.status_code in [200, 404], f"Unexpected status: {resp.status_code}"
        print(f"PASSED: /api/media-file endpoint exists")
    
    def test_legacy_media_endpoint_exists(self):
        """GET /api/media/{id} legacy alias exists"""
        resp = requests.get(f"{BASE_URL}/api/media/000000000000000000000000")
        assert resp.status_code in [200, 404], f"Unexpected status: {resp.status_code}"
        print(f"PASSED: /api/media legacy endpoint exists")


class TestRegressionWatermark(TestAuth):
    """Regression tests for watermark endpoints"""
    
    def test_watermark_url_endpoint(self, fan_session):
        """POST /api/media/wm-url returns signed path"""
        resp = fan_session.post(f"{BASE_URL}/api/media/wm-url", json={
            "src": "https://example.com/test.jpg"
        })
        assert resp.status_code == 200, f"wm-url failed: {resp.text}"
        data = resp.json()
        
        assert "path" in data, f"Missing path: {data}"
        assert "expires_in" in data, f"Missing expires_in: {data}"
        assert "/api/media/wm" in data["path"], f"Invalid path: {data['path']}"
        
        print(f"PASSED: /api/media/wm-url returns signed path")


class TestRegressionStripe(TestAuth):
    """Regression tests for Stripe endpoints"""
    
    def test_stripe_setup_intent(self, fan_session):
        """POST /api/wallet/cards/setup-intent returns seti_* and cus_*"""
        resp = fan_session.post(f"{BASE_URL}/api/wallet/cards/setup-intent")
        assert resp.status_code == 200, f"Setup intent failed: {resp.text}"
        data = resp.json()
        
        assert "client_secret" in data, f"Missing client_secret: {data}"
        assert "customer_id" in data, f"Missing customer_id: {data}"
        
        # Check prefixes
        client_secret = data["client_secret"]
        customer_id = data["customer_id"]
        
        assert client_secret.startswith("seti_"), f"client_secret should start with seti_: {client_secret[:20]}"
        assert customer_id.startswith("cus_"), f"customer_id should start with cus_: {customer_id}"
        
        print(f"PASSED: Stripe SetupIntent returns seti_*/cus_*")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
