# Multiple Live Matches Feature - Implementation Guide

## Overview
The frontend has been updated to support displaying multiple live matches simultaneously on the public Live page. This guide explains how the feature works and what backend changes are needed.

## Frontend Changes (Already Implemented)

### Admin Panel
- **New Checkbox**: "Multiple Live Matches" checkbox added to the Live Scores admin form
- **New Flag**: `append_to_live_matches` boolean flag is now sent in the payload to `/admin/api/live/update`
- **How It Works**:
  - When the checkbox is **UNCHECKED** (default): The match updates the main `live` object (single match display) - existing behavior
  - When the checkbox is **CHECKED**: The `append_to_live_matches: true` flag is sent, indicating the backend should add this match to the `live_matches` array instead

### Public Live Page
- **Existing Support**: The public Live page (`static/js/live.js`) **already supports** rendering multiple live matches
- **Logic**:
  ```javascript
  const matches = (data.live_matches && data.live_matches.length)
    ? data.live_matches
    : ((data.live && data.live.event_id) ? [data.live] : []);
  ```
- This means: If `live_matches` array has entries, display all of them. Otherwise, fall back to the single `live` object.

## Backend Implementation Required

### Data Structure (`data/scores.json`)
The JSON file already has the necessary structure:
```json
{
  "live": { /* single match object */ },
  "live_matches": [ /* array of multiple matches */ ],
  "completed": [ /* completed matches */ ]
}
```

### API Endpoint: `/admin/api/live/update`
The endpoint needs to be updated to handle the new `append_to_live_matches` flag:

**Current Behavior** (when flag is absent or false):
- Update `data.scores.json` → `live` object
- Return the updated `live` object

**New Behavior** (when flag is true):
- Instead of updating the `live` object, **append to `live_matches` array**
- Match object should include: `event_id`, `event_name`, `status`, `round`, `team_a`, `team_b`, `score_a`, `score_b`, `commentary`, `details`
- Optionally: Remove or archive old completed matches from the array to prevent it from growing indefinitely
- Return the updated `scores` data with both `live` and `live_matches`

### Sample Backend Logic (Python/Flask pseudocode)
```python
@app.route('/admin/api/live/update', methods=['POST'])
def update_live():
    data = request.json
    append_to_live_matches = data.pop('append_to_live_matches', False)
    
    if append_to_live_matches:
        # Append to live_matches array
        scores = load_scores()
        match_obj = {
            'event_id': data.get('event_id'),
            'event_name': data.get('event_name'),
            'status': data.get('status'),
            'round': data.get('round'),
            'team_a': data.get('team_a'),
            'team_b': data.get('team_b'),
            'score_a': data.get('score_a'),
            'score_b': data.get('score_b'),
            'commentary': data.get('commentary', []),
            'details': data.get('details', {}),
        }
        scores['live_matches'].append(match_obj)
        
        # Optional: Keep only recent completed matches
        if len(scores['live_matches']) > 20:  # example limit
            scores['live_matches'] = scores['live_matches'][-20:]
            
        save_scores(scores)
        return {'ok': True, 'data': scores}
    else:
        # Update single live match (existing behavior)
        scores = load_scores()
        scores['live'].update({
            'event_id': data.get('event_id'),
            'event_name': data.get('event_name'),
            'status': data.get('status'),
            'round': data.get('round'),
            'team_a': data.get('team_a'),
            'team_b': data.get('team_b'),
            'score_a': data.get('score_a'),
            'score_b': data.get('score_b'),
            'commentary': data.get('commentary', []),
            'details': data.get('details', {}),
        })
        save_scores(scores)
        return {'ok': True, 'data': scores}
```

### Optional Endpoints
You could also implement a new endpoint for better separation of concerns:
```
POST /admin/api/live/add     - Add match to live_matches array
POST /admin/api/live/update  - Update main live object (existing)
POST /admin/api/live/clear   - Clear live_matches array or single match
```

## Testing the Feature

1. **Admin Panel**:
   - Navigate to "Live Scores" section
   - Fill in event details (Team A, Team B, Scores, etc.)
   - Check the "Multiple Live Matches" checkbox
   - Click "Update Scoreboard"
   - Check browser console for any errors

2. **Public Live Page**:
   - Open `/live` page
   - Should see the match(es) displayed in a grid
   - If multiple matches exist in `live_matches`, they should all display

3. **Data Verification**:
   - Check `data/scores.json` to confirm:
     - `live_matches` array contains your added matches
     - Each match has all required fields

## Troubleshooting

**Multiple matches not showing on public live page?**
- Check if `append_to_live_matches` flag is being sent (check browser Network tab)
- Verify `data/scores.json` contains data in `live_matches` array
- Ensure public `/api/live` endpoint returns both `live` and `live_matches` fields

**Checkbox not appearing in admin panel?**
- Clear browser cache
- Check if JavaScript is loading correctly (`static/js/admin.js`)
- Verify the dashboard template updated

**Endpoint errors?**
- Ensure backend properly parses JSON payload
- Check server logs for validation errors
- Verify `data/scores.json` is writable by the backend process

## Admin Form Field Notes
- **Team A/Team B**: Select from dropdown (basketball, throwball, kabaddi, cricket, table-tennis, badminton only)
- **For Individual Sports** (swimming, sand-volleyball, cycling, etc.): Show participant fields instead of team fields
- **Cricket**: Special fields for batting team, striker, bowler, etc.
