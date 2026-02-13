<?php

namespace Kanboard\Model;

use Kanboard\Core\Base;

/**
 * User Browser Notification
 *
 * @package  Kanboard\Model
 */
class UserBrowserNotificationModel extends Base
{
    /**
     * SQL table name
     *
     * @var string
     */
    const TABLE = 'user_has_browser_notifications';

    /**
     * Add browser notification to someone
     *
     * @access public
     * @param  integer   $user_id
     * @param  string    $event_name
     * @param  array     $event_data
     */
    public function create($user_id, $event_name, array $event_data)
    {
        $this->db->table(self::TABLE)->insert(array(
            'user_id' => $user_id,
            'date_creation' => time(),
            'event_name' => $event_name,
            'event_data' => json_encode($event_data),
        ));
    }

    /**
     * Get notifications after an id for a user
     *
     * @access public
     * @param  integer $user_id
     * @param  integer $last_id
     * @return array
     */
    public function getAllAfterId($user_id, $last_id)
    {
        $events = $this->db->table(self::TABLE)
            ->eq('user_id', $user_id)
            ->gt('id', $last_id)
            ->asc('id')
            ->findAll();

        foreach ($events as &$event) {
            $this->unserialize($event);
        }

        return $events;
    }

    /**
     * Remove notifications for a user by ids
     *
     * @access public
     * @param  integer $user_id
     * @param  integer[] $ids
     * @return boolean
     */
    public function removeByIds($user_id, array $ids)
    {
        if (empty($ids)) {
            return true;
        }

        return $this->db->table(self::TABLE)
            ->eq('user_id', $user_id)
            ->in('id', $ids)
            ->remove();
    }

    private function unserialize(array &$event)
    {
        $event['event_data'] = json_decode($event['event_data'], true);
        $event['title'] = $this->notificationModel->getTitleWithoutAuthor($event['event_name'], $event['event_data']);
    }
}
