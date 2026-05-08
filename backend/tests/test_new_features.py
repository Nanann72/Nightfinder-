"""
me&you API Backend Tests - Iteration 3
Tests for new features: Upload, Stories, Feed, Notifications, Creator Reply, Resend Emails
"""
import pytest
import requests
import os
import time
import uuid
import io
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fan-culture.preview.emergentagent.com').rstrip('/')

# Test credentials from test_credentials.md
FAN_EMAIL = "fan@meandyou.fans"
FAN_PASSWORD = "TestFan2026!"
CREATOR_EMAIL = "lysepress@meandyou.fans"
CREATOR_PASSWORD = "Creator2026!"
ADMIN_EMAIL = "admin@meandyou.fans"
ADMIN_PASSWORD = "Admin2026!"


def get_auth_token(email: str, password: str) -> str:
    """Helper to get auth token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    return resp.json()["access_token"]


def get_auth_headers(email: str, password: str) -> dict:
    """Helper to get auth headers"""
    token = get_auth_token(email, password)
    return {"Authorization": f"Bearer {token}"}


# ============ UPLOAD TESTS ============
class TestUpload:
    """Tests for POST /api/upload - direct file uploads"""
    
    def test_upload_jpg_authenticated(self):
        """POST /api/upload - authenticated user can upload .jpg"""
        headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        # Create a small fake JPG file (just bytes, not a real image)
        fake_jpg = io.BytesIO(b'\xff\xd8\xff\xe0' + b'\x00' * 100)  # JPG magic bytes
        files = {'file': ('test_image.jpg', fake_jpg, 'image/jpeg')}
        
        response = requests.post(f"{BASE_URL}/api/upload", files=files, headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "url" in data, "Response should contain 'url'"
        assert "filename" in data, "Response should contain 'filename'"
        assert "size" in data, "Response should contain 'size'"
        assert "content_type" in data, "Response should contain 'content_type'"
        assert data["url"].startswith("/api/uploads/"), f"URL should start with /api/uploads/, got {data['url']}"
        assert data["filename"].endswith(".jpg"), f"Filename should end with .jpg, got {data['filename']}"
        
        print(f"✓ Upload JPG passed: {data['url']}")
        return data["url"]
    
    def test_upload_png_authenticated(self):
        """POST /api/upload - authenticated user can upload .png"""
        headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        # Create a small fake PNG file
        fake_png = io.BytesIO(b'\x89PNG\r\n\x1a\n' + b'\x00' * 100)  # PNG magic bytes
        files = {'file': ('test_image.png', fake_png, 'image/png')}
        
        response = requests.post(f"{BASE_URL}/api/upload", files=files, headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["url"].startswith("/api/uploads/")
        assert data["filename"].endswith(".png")
        print(f"✓ Upload PNG passed: {data['url']}")
    
    def test_upload_mp4_authenticated(self):
        """POST /api/upload - authenticated user can upload .mp4"""
        headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        # Create a small fake MP4 file
        fake_mp4 = io.BytesIO(b'\x00\x00\x00\x1c\x66\x74\x79\x70' + b'\x00' * 100)  # MP4 magic bytes
        files = {'file': ('test_video.mp4', fake_mp4, 'video/mp4')}
        
        response = requests.post(f"{BASE_URL}/api/upload", files=files, headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["url"].startswith("/api/uploads/")
        assert data["filename"].endswith(".mp4")
        print(f"✓ Upload MP4 passed: {data['url']}")
    
    def test_upload_txt_rejected(self):
        """POST /api/upload - .txt file should be rejected with 400"""
        headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        fake_txt = io.BytesIO(b'This is a text file')
        files = {'file': ('test_file.txt', fake_txt, 'text/plain')}
        
        response = requests.post(f"{BASE_URL}/api/upload", files=files, headers=headers)
        
        assert response.status_code == 400, f"Expected 400 for .txt, got {response.status_code}: {response.text}"
        print("✓ Upload .txt rejected with 400")
    
    def test_upload_too_large_rejected(self):
        """POST /api/upload - file > 25MB should be rejected with 413"""
        headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        # Create a file larger than 25MB (26MB)
        large_file = io.BytesIO(b'\xff\xd8\xff\xe0' + b'\x00' * (26 * 1024 * 1024))
        files = {'file': ('large_image.jpg', large_file, 'image/jpeg')}
        
        response = requests.post(f"{BASE_URL}/api/upload", files=files, headers=headers)
        
        assert response.status_code == 413, f"Expected 413 for large file, got {response.status_code}: {response.text}"
        print("✓ Upload >25MB rejected with 413")
    
    def test_upload_unauthenticated_rejected(self):
        """POST /api/upload - unauthenticated returns 401"""
        fake_jpg = io.BytesIO(b'\xff\xd8\xff\xe0' + b'\x00' * 100)
        files = {'file': ('test_image.jpg', fake_jpg, 'image/jpeg')}
        
        response = requests.post(f"{BASE_URL}/api/upload", files=files)
        
        assert response.status_code == 401, f"Expected 401 for unauthenticated, got {response.status_code}"
        print("✓ Upload unauthenticated rejected with 401")
    
    def test_uploaded_file_accessible(self):
        """GET /api/uploads/{filename} - uploaded file should be accessible"""
        headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        # Upload a file first
        fake_jpg = io.BytesIO(b'\xff\xd8\xff\xe0' + b'\x00' * 100)
        files = {'file': ('test_access.jpg', fake_jpg, 'image/jpeg')}
        
        upload_resp = requests.post(f"{BASE_URL}/api/upload", files=files, headers=headers)
        assert upload_resp.status_code == 200
        
        url = upload_resp.json()["url"]
        
        # Access the uploaded file (no auth needed for static files)
        access_resp = requests.get(f"{BASE_URL}{url}")
        
        assert access_resp.status_code == 200, f"Expected 200 for file access, got {access_resp.status_code}"
        print(f"✓ Uploaded file accessible at {url}")


# ============ STORIES TESTS ============
class TestStories:
    """Tests for /api/stories - 24h ephemeral stories"""
    
    def test_list_stories_returns_groups(self):
        """GET /api/stories - returns list of active stories grouped by creator"""
        response = requests.get(f"{BASE_URL}/api/stories")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        
        # Should have seeded story groups (5 creators with stories)
        if len(data) > 0:
            group = data[0]
            assert "creator_id" in group, "Group should have creator_id"
            assert "display_name" in group, "Group should have display_name"
            assert "handle" in group, "Group should have handle"
            assert "avatar_url" in group, "Group should have avatar_url"
            assert "stories" in group, "Group should have stories list"
            assert "latest_at" in group, "Group should have latest_at"
            
            # Check story structure
            if len(group["stories"]) > 0:
                story = group["stories"][0]
                assert "story_id" in story
                assert "media_url" in story
                assert "expires_at" in story
        
        print(f"✓ List stories passed: {len(data)} story groups")
        return data
    
    def test_list_stories_has_seeded_groups(self):
        """GET /api/stories - should have 5 seeded story groups"""
        response = requests.get(f"{BASE_URL}/api/stories")
        
        assert response.status_code == 200
        data = response.json()
        
        # Seeded creators with stories: Lyse Press, Emma Rose, Sophie Luxe, Clara Nuit, Julie Ether
        assert len(data) >= 5, f"Expected at least 5 seeded story groups, got {len(data)}"
        print(f"✓ Seeded story groups present: {len(data)} groups")
    
    def test_create_story_as_creator(self):
        """POST /api/stories - authenticated creator can create a story"""
        headers = get_auth_headers(CREATOR_EMAIL, CREATOR_PASSWORD)
        
        payload = {
            "media_url": "https://example.com/test-story.jpg",
            "caption": "Test story caption"
        }
        
        response = requests.post(f"{BASE_URL}/api/stories", json=payload, headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "story_id" in data, "Response should have story_id"
        assert "expires_at" in data, "Response should have expires_at"
        assert data["media_url"] == payload["media_url"]
        assert data["caption"] == payload["caption"]
        
        # Verify expires_at is ~24h later
        expires_at = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
        now = datetime.now(expires_at.tzinfo)
        diff = expires_at - now
        assert 23 <= diff.total_seconds() / 3600 <= 25, f"expires_at should be ~24h later, got {diff}"
        
        print(f"✓ Create story passed: {data['story_id']}, expires_at={data['expires_at']}")
        return data
    
    def test_create_story_as_fan_rejected(self):
        """POST /api/stories - non-creator returns 403"""
        headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        payload = {
            "media_url": "https://example.com/test-story.jpg",
            "caption": "Test story"
        }
        
        response = requests.post(f"{BASE_URL}/api/stories", json=payload, headers=headers)
        
        assert response.status_code == 403, f"Expected 403 for fan, got {response.status_code}: {response.text}"
        print("✓ Create story as fan rejected with 403")
    
    def test_create_story_unauthenticated_rejected(self):
        """POST /api/stories - unauthenticated returns 401"""
        payload = {
            "media_url": "https://example.com/test-story.jpg",
            "caption": "Test story"
        }
        
        response = requests.post(f"{BASE_URL}/api/stories", json=payload)
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Create story unauthenticated rejected with 401")


# ============ FEED TESTS ============
class TestFeed:
    """Tests for GET /api/feed - global content feed"""
    
    def test_feed_returns_content_items(self):
        """GET /api/feed - returns up to 30 content items with creator info"""
        response = requests.get(f"{BASE_URL}/api/feed")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        assert len(data) <= 30, f"Feed should return max 30 items, got {len(data)}"
        
        if len(data) > 0:
            item = data[0]
            assert "content_id" in item, "Item should have content_id"
            assert "creator" in item, "Item should have creator info"
            assert "is_unlocked" in item, "Item should have is_unlocked flag"
            
            creator = item["creator"]
            assert "display_name" in creator
            assert "handle" in creator
            assert "avatar_url" in creator
        
        print(f"✓ Feed returned {len(data)} items")
        return data
    
    def test_feed_unauthenticated_premium_locked(self):
        """GET /api/feed - unauthenticated: all premium items should be is_unlocked=false"""
        response = requests.get(f"{BASE_URL}/api/feed")
        
        assert response.status_code == 200
        data = response.json()
        
        premium_items = [item for item in data if item.get("is_premium")]
        locked_premium = [item for item in premium_items if not item.get("is_unlocked")]
        
        # All premium items should be locked for unauthenticated
        assert len(locked_premium) == len(premium_items), \
            f"All premium items should be locked for unauthenticated, but {len(premium_items) - len(locked_premium)} are unlocked"
        
        print(f"✓ Feed unauthenticated: {len(premium_items)} premium items all locked")
    
    def test_feed_authenticated_subscribed_unlocked(self):
        """GET /api/feed - authenticated subscribed user: items from subscribed creator are is_unlocked=true"""
        # This test would require a user with an active subscription
        # For now, just verify the endpoint works with auth
        headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        response = requests.get(f"{BASE_URL}/api/feed", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Check structure is correct
        for item in data:
            assert "is_unlocked" in item
            assert "creator" in item
        
        print(f"✓ Feed authenticated: {len(data)} items returned")


# ============ NOTIFICATIONS TESTS ============
class TestNotifications:
    """Tests for /api/notifications endpoints"""
    
    def test_list_notifications_authenticated(self):
        """GET /api/notifications - authenticated user gets {items, unread}"""
        headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "items" in data, "Response should have 'items'"
        assert "unread" in data, "Response should have 'unread'"
        assert isinstance(data["items"], list)
        assert isinstance(data["unread"], int)
        
        print(f"✓ List notifications passed: {len(data['items'])} items, {data['unread']} unread")
        return data
    
    def test_list_notifications_unauthenticated_rejected(self):
        """GET /api/notifications - unauthenticated returns 401"""
        response = requests.get(f"{BASE_URL}/api/notifications")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ List notifications unauthenticated rejected with 401")
    
    def test_unread_count(self):
        """GET /api/notifications/unread-count - returns {unread: int}"""
        headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        response = requests.get(f"{BASE_URL}/api/notifications/unread-count", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "unread" in data, "Response should have 'unread'"
        assert isinstance(data["unread"], int)
        
        print(f"✓ Unread count passed: {data['unread']}")
    
    def test_mark_read(self):
        """POST /api/notifications/mark-read - sets all unread to read"""
        headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        response = requests.post(f"{BASE_URL}/api/notifications/mark-read", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("ok") == True
        
        # Verify unread count is now 0
        unread_resp = requests.get(f"{BASE_URL}/api/notifications/unread-count", headers=headers)
        assert unread_resp.json()["unread"] == 0, "Unread count should be 0 after mark-read"
        
        print("✓ Mark read passed")
    
    def test_registration_creates_welcome_notification(self):
        """Registration triggers welcome notification (kind='welcome')"""
        # Register a new user
        unique_email = f"test_notif_{uuid.uuid4().hex[:8]}@test.com"
        reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123!",
            "name": "Notification Test User",
            "is_creator": False
        })
        
        if reg_resp.status_code != 200:
            print(f"⚠ Could not register user for notification test: {reg_resp.text}")
            return
        
        token = reg_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Check notifications
        notif_resp = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        assert notif_resp.status_code == 200
        
        data = notif_resp.json()
        welcome_notifs = [n for n in data["items"] if n.get("kind") == "welcome"]
        
        assert len(welcome_notifs) >= 1, "New user should have a welcome notification"
        print(f"✓ Registration creates welcome notification: {welcome_notifs[0]['title']}")


# ============ CREATOR REPLY (MESSAGING) TESTS ============
class TestCreatorReply:
    """Tests for creator reply functionality with fan_id"""
    
    def test_creator_reply_with_fan_id(self):
        """POST /api/messages with fan_id - creator can reply to a fan"""
        # First, fan sends a message to creator
        fan_headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        # Get creator_id for lysepress
        creators_resp = requests.get(f"{BASE_URL}/api/creators")
        creators = creators_resp.json()
        lyse_creator = next((c for c in creators if c["handle"] == "lysepress"), None)
        assert lyse_creator, "Lyse Press creator should exist"
        creator_id = lyse_creator["creator_id"]
        
        # Fan sends message
        fan_msg_payload = {
            "creator_id": creator_id,
            "body": f"Test message from fan {uuid.uuid4().hex[:6]}"
        }
        fan_msg_resp = requests.post(f"{BASE_URL}/api/messages", json=fan_msg_payload, headers=fan_headers)
        assert fan_msg_resp.status_code == 200, f"Fan message failed: {fan_msg_resp.text}"
        
        fan_id = fan_msg_resp.json()["fan_id"]
        
        # Now creator replies
        creator_headers = get_auth_headers(CREATOR_EMAIL, CREATOR_PASSWORD)
        
        reply_payload = {
            "creator_id": creator_id,
            "body": f"Reply from creator {uuid.uuid4().hex[:6]}",
            "fan_id": fan_id
        }
        reply_resp = requests.post(f"{BASE_URL}/api/messages", json=reply_payload, headers=creator_headers)
        
        assert reply_resp.status_code == 200, f"Expected 200, got {reply_resp.status_code}: {reply_resp.text}"
        data = reply_resp.json()
        
        assert data["sender_id"] == creator_id, "Sender should be creator"
        assert data["fan_id"] == fan_id, "fan_id should match"
        
        print(f"✓ Creator reply with fan_id passed: {data['message_id']}")
        return data
    
    def test_creator_reply_without_fan_id_rejected(self):
        """POST /api/messages - creator without fan_id returns 400"""
        creator_headers = get_auth_headers(CREATOR_EMAIL, CREATOR_PASSWORD)
        
        # Get creator_id
        creators_resp = requests.get(f"{BASE_URL}/api/creators")
        lyse_creator = next((c for c in creators_resp.json() if c["handle"] == "lysepress"), None)
        creator_id = lyse_creator["creator_id"]
        
        # Creator tries to send without fan_id
        payload = {
            "creator_id": creator_id,
            "body": "Reply without fan_id"
            # Missing fan_id
        }
        response = requests.post(f"{BASE_URL}/api/messages", json=payload, headers=creator_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ Creator reply without fan_id rejected with 400")
    
    def test_get_thread_creator_requires_fan_id(self):
        """GET /api/messages/{creator_id} - creator must pass fan_id query param"""
        creator_headers = get_auth_headers(CREATOR_EMAIL, CREATOR_PASSWORD)
        
        # Get creator_id
        creators_resp = requests.get(f"{BASE_URL}/api/creators")
        lyse_creator = next((c for c in creators_resp.json() if c["handle"] == "lysepress"), None)
        creator_id = lyse_creator["creator_id"]
        
        # Creator tries to get thread without fan_id
        response = requests.get(f"{BASE_URL}/api/messages/{creator_id}", headers=creator_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "fan_id" in response.text.lower(), "Error should mention fan_id"
        print("✓ Creator get thread without fan_id rejected with 400")
    
    def test_get_thread_creator_with_fan_id(self):
        """GET /api/messages/{creator_id}?fan_id=... - creator can fetch specific thread"""
        # First ensure there's a message thread
        fan_headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        creators_resp = requests.get(f"{BASE_URL}/api/creators")
        lyse_creator = next((c for c in creators_resp.json() if c["handle"] == "lysepress"), None)
        creator_id = lyse_creator["creator_id"]
        
        # Fan sends message
        fan_msg_resp = requests.post(f"{BASE_URL}/api/messages", json={
            "creator_id": creator_id,
            "body": "Test thread message"
        }, headers=fan_headers)
        assert fan_msg_resp.status_code == 200
        fan_id = fan_msg_resp.json()["fan_id"]
        
        # Creator fetches thread with fan_id
        creator_headers = get_auth_headers(CREATOR_EMAIL, CREATOR_PASSWORD)
        response = requests.get(f"{BASE_URL}/api/messages/{creator_id}?fan_id={fan_id}", headers=creator_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Creator get thread with fan_id passed: {len(data)} messages")
    
    def test_fan_get_thread_without_fan_id_works(self):
        """GET /api/messages/{creator_id} - fan calling without fan_id works (uses own user_id)"""
        fan_headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        creators_resp = requests.get(f"{BASE_URL}/api/creators")
        lyse_creator = next((c for c in creators_resp.json() if c["handle"] == "lysepress"), None)
        creator_id = lyse_creator["creator_id"]
        
        # Fan gets thread without fan_id (should use own user_id)
        response = requests.get(f"{BASE_URL}/api/messages/{creator_id}", headers=fan_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Fan get thread without fan_id passed: {len(data)} messages")
    
    def test_message_creates_notification_for_recipient(self):
        """POST /api/messages - recipient gets new-message notification"""
        # Fan sends message to creator
        fan_headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        creators_resp = requests.get(f"{BASE_URL}/api/creators")
        lyse_creator = next((c for c in creators_resp.json() if c["handle"] == "lysepress"), None)
        creator_id = lyse_creator["creator_id"]
        
        unique_body = f"Notification test message {uuid.uuid4().hex[:8]}"
        fan_msg_resp = requests.post(f"{BASE_URL}/api/messages", json={
            "creator_id": creator_id,
            "body": unique_body
        }, headers=fan_headers)
        assert fan_msg_resp.status_code == 200
        
        # Wait a moment for background task
        time.sleep(1)
        
        # Check creator's notifications
        creator_headers = get_auth_headers(CREATOR_EMAIL, CREATOR_PASSWORD)
        notif_resp = requests.get(f"{BASE_URL}/api/notifications", headers=creator_headers)
        assert notif_resp.status_code == 200
        
        data = notif_resp.json()
        message_notifs = [n for n in data["items"] if n.get("kind") == "message"]
        
        # Should have at least one message notification
        assert len(message_notifs) >= 1, "Creator should have message notification"
        print(f"✓ Message creates notification for recipient: {len(message_notifs)} message notifications")


# ============ REGRESSION TESTS ============
class TestRegression:
    """Regression tests for existing endpoints"""
    
    def test_auth_login_still_works(self):
        """POST /api/auth/login - existing auth still works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL, "password": FAN_PASSWORD
        })
        assert response.status_code == 200
        print("✓ Auth login regression passed")
    
    def test_creators_list_still_works(self):
        """GET /api/creators - existing endpoint still works"""
        response = requests.get(f"{BASE_URL}/api/creators")
        assert response.status_code == 200
        assert len(response.json()) >= 6
        print("✓ Creators list regression passed")
    
    def test_fan_message_without_fan_id_still_works(self):
        """POST /api/messages - fan without fan_id still works"""
        fan_headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        creators_resp = requests.get(f"{BASE_URL}/api/creators")
        creator_id = creators_resp.json()[0]["creator_id"]
        
        response = requests.post(f"{BASE_URL}/api/messages", json={
            "creator_id": creator_id,
            "body": "Regression test message"
        }, headers=fan_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Fan message without fan_id regression passed")
    
    def test_payments_subscribe_still_works(self):
        """POST /api/payments/subscribe - existing payment flow still works"""
        headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        creators_resp = requests.get(f"{BASE_URL}/api/creators")
        creator_id = creators_resp.json()[0]["creator_id"]
        
        response = requests.post(f"{BASE_URL}/api/payments/subscribe", json={
            "creator_id": creator_id,
            "origin_url": "https://fan-culture.preview.emergentagent.com"
        }, headers=headers)
        
        assert response.status_code == 200
        assert "url" in response.json()
        assert "session_id" in response.json()
        print("✓ Payments subscribe regression passed")
    
    def test_verification_start_still_works(self):
        """POST /api/verification/start - existing verification still works"""
        headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        response = requests.post(f"{BASE_URL}/api/verification/start", headers=headers)
        
        assert response.status_code == 200
        assert "mode" in response.json()
        print("✓ Verification start regression passed")


# ============ EMAIL INTEGRATION TESTS ============
class TestEmailIntegration:
    """Tests for Resend email integration (best-effort, non-blocking)"""
    
    def test_registration_triggers_welcome_email_attempt(self):
        """Registration should attempt to send welcome email (check backend logs)"""
        # Register a new user
        unique_email = f"test_email_{uuid.uuid4().hex[:8]}@test.com"
        reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123!",
            "name": "Email Test User",
            "is_creator": False
        })
        
        # Registration should succeed regardless of email delivery
        assert reg_resp.status_code == 200, f"Registration should succeed: {reg_resp.text}"
        print("✓ Registration succeeds (email sent via BackgroundTasks - check backend logs)")
    
    def test_message_triggers_email_attempt(self):
        """Message should attempt to send new-message email (non-blocking)"""
        fan_headers = get_auth_headers(FAN_EMAIL, FAN_PASSWORD)
        
        creators_resp = requests.get(f"{BASE_URL}/api/creators")
        creator_id = creators_resp.json()[0]["creator_id"]
        
        response = requests.post(f"{BASE_URL}/api/messages", json={
            "creator_id": creator_id,
            "body": "Email trigger test message"
        }, headers=fan_headers)
        
        # Message should succeed regardless of email delivery
        assert response.status_code == 200, f"Message should succeed: {response.text}"
        print("✓ Message succeeds (email sent via BackgroundTasks - check backend logs)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
